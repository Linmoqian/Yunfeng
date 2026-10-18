/* 宿主 Pi 扩展桥：生命周期仅观察，显式事实通知经 Hook 重新核验。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { randomUUID } from "node:crypto";
import { createEventBus, type ExtensionFactory } from "../../agent/sdk.js";
import { researchEvent, type ResearchEvent } from "./types.js";

/** 单任务存活的内置桥，不加载任意扩展文件，也不接收可执行动作。 */
export class PiResearchBridge {
  readonly eventBus = createEventBus();
  private closed = false;
  private accepted = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly taskId: string, private readonly observed: () => readonly string[], private readonly publish: (event: ResearchEvent) => boolean) {
    this.unsubscribe = this.eventBus.on("research:changed", (data) => {
      if (this.closed || !data || typeof data !== "object") return;
      const paths = (data as { paths?: unknown }).paths;
      if (!Array.isArray(paths) || !paths.length || paths.length > 8 || paths.some((p) => typeof p !== "string" || !this.observed().includes(p))) return;
      this.accepted = this.publish(researchEvent({ kind: "pi_extension", taskId: this.taskId, action: "facts_changed", paths: [...new Set(paths)] }));
    });
  }
  /** 受信本地适配器与 Pi 扩展共享 research:changed；只允许当前观察文件。 */
  notify(paths: readonly string[]): boolean {
    this.accepted = false;
    if (!this.closed) this.eventBus.emit("research:changed", { paths });
    return this.accepted;
  }
  /** 每个临时会话绑定独立来源；自身生命周期不能触发新的模型轮次。 */
  extension(phase: string): ExtensionFactory {
    const sessionId = randomUUID();
    return (pi) => {
      const emit = (action: "agent_start" | "agent_settled") => {
        if (!this.closed) this.publish(researchEvent({ kind: "pi_extension", taskId: this.taskId, sessionId, phase, action, paths: [] }));
      };
      pi.on("agent_start", () => { emit("agent_start"); });
      pi.on("agent_settled", () => { emit("agent_settled"); });
    };
  }
  close(): void { this.closed = true; this.unsubscribe(); this.eventBus.clear(); }
}
