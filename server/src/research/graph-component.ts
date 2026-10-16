/* 任务内关系图组件：短期交互租约与聚焦请求，不持久化鼠标状态或重放控制。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { randomUUID } from "node:crypto";
import { componentClient, type ComponentRequest } from "../agent/component-client.js";
import type { TaskState } from "../task/types.js";
import { record } from "./values.js";

type Focus = { epoch: string; component: "research-graph"; revision: number; target: string | null };
type Report = { sequence: number; visible: boolean; editing: boolean; renderedRevision: number | null; focusedRevision: number | null };
/** 临时状态随服务重启清空；失联后拒绝控制，已接受的聚焦最多有效两秒。 */
export class ResearchGraphComponent {
  private report?: Report & { at: number };
  private focus: Focus = { epoch: randomUUID(), component: "research-graph", revision: 0, target: null };
  private focusedAt = 0;
  constructor(private readonly read: () => TaskState, private readonly now = Date.now) {}
  status() {
    const known = !!this.report && this.now() - this.report.at < 2500;
    const visible = known && this.report!.visible;
    const editing = known && this.report!.editing;
    const rendered = visible && this.report!.renderedRevision === this.read().lastEventSeq;
    return { component: "research-graph" as const, version: this.report?.sequence ?? 0, known, visible, editing,
      yielded: !rendered || editing, renderedRevision: known ? this.report!.renderedRevision : null,
      rendered,
      focusedRevision: known ? this.report!.focusedRevision : null };
  }
  /** UI 反馈只接受单调序号和当前任务已发布的版本，不能更改目标树。 */
  receive(value: unknown) {
    const row = record(value);
    if (Object.keys(row).some((key) => !["sequence", "visible", "editing", "renderedRevision", "focusedRevision", "epoch"].includes(key))
      || (row.epoch !== undefined && row.epoch !== null && typeof row.epoch !== "string")
      || !Number.isSafeInteger(row.sequence) || Number(row.sequence) < 0 || typeof row.visible !== "boolean" || typeof row.editing !== "boolean"
      || ![row.renderedRevision, row.focusedRevision].every((n) => n === null || (Number.isSafeInteger(n) && Number(n) >= 0))) throw new Error("关系图交互反馈无效");
    if (Number(row.renderedRevision ?? 0) > this.read().lastEventSeq || (row.epoch === this.focus.epoch && Number(row.focusedRevision ?? 0) > this.focus.revision)) throw new Error("关系图反馈版本尚未发布");
    if (!this.report || Number(row.sequence) > this.report.sequence) {
      this.report = { ...row as unknown as Report, focusedRevision: row.epoch === this.focus.epoch ? row.focusedRevision as number | null : null, at: this.now() };
      if (row.editing || !row.visible) this.clear();
    }
    return this.snapshot(false);
  }
  private clear() { if (this.focus.target) this.focus = { ...this.focus, revision: this.focus.revision + 1, target: null }; }
  private snapshot(includeState = true) {
    if (this.now() - this.focusedAt > 2000) this.clear();
    return { component: "research-graph", revision: this.read().lastEventSeq, ...(includeState ? { state: this.read().autonomy!.decision } : {}),
      focus: this.focus, interaction: this.status() };
  }
  /** 使用同一组件 envelope；focus(current) 在服务端解析为当前节点。 */
  async call(value: unknown) {
    const request = record(value);
    if (request.component !== "research-graph" || Object.keys(request).some((key) => !["action", "component", "target"].includes(key))) throw new Error("关系图组件请求无效");
    if (request.action === "read") return this.snapshot();
    if (request.action === "status") return this.status();
    if (request.action === "blur") { this.clear(); return this.focus; }
    if (request.action !== "focus") throw new Error("关系图仅支持 read/status/focus/blur");
    const tree = this.read().autonomy!.decision;
    const target = request.target === undefined || request.target === "current" || request.target === "component" ? tree?.selectedId : request.target;
    if (typeof target !== "string" || !target || (target !== "mission" && !tree?.nodes.some((node) => node.id === target))) throw new Error("关系图节点不存在");
    const status = this.status();
    if (status.yielded) return { ...this.focus, accepted: false, reason: status.editing ? "COMPONENT_BUSY" : "INTERACTION_UNAVAILABLE" };
    this.focus = { ...this.focus, revision: this.focus.revision + 1, target };
    this.focusedAt = this.now();
    return { ...this.focus, accepted: true };
  }
  client() {
    const client = componentClient<"research-graph">(async <T>({ request }: { request: ComponentRequest<"research-graph"> }) => await this.call(request) as T);
    return { ...client, focus: (component: "research-graph", target = "current") => client.focus(component, target) as Promise<Focus & { accepted: boolean; reason?: string }> };
  }
}
