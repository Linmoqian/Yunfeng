/* Hook 事件只描述通知来源；真实状态由 Context Builder 重新读取。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { randomUUID } from "node:crypto";
import type { ResearchCheckpoint, Result } from "../types.js";
export type EventData = { kind: "lifecycle"; action: "started" | "resumed" | "recovered" }
  | { kind: "files_changed"; paths: string[] }
  | { kind: "job_completed"; jobId: string; status: Result["status"] }
  | { kind: "pi_extension"; taskId: string; sessionId?: string; phase?: string; action: "agent_start" | "agent_settled" | "facts_changed"; paths: string[] }
  | { kind: "approval_granted"; requestId: string };
export type ResearchEvent = EventData & { id: string; occurredAt: string };
export interface HookSignal { hook: string; reason: string; event: ResearchEvent }
export interface ResearchHook {
  name: string;
  accept(event: ResearchEvent, state: ResearchCheckpoint): string | undefined;
}
/** 仅供受信任的本地适配器使用，不接收模型提交的副作用或外部事实。 */
export function researchEvent(data: EventData): ResearchEvent {
  return { ...data, id: randomUUID(), occurredAt: new Date().toISOString() };
}
