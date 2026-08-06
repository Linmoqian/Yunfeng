// TaskRuntime：把 pi 运行时会话适配到任务领域。
// 负责状态机、命令执行、事件映射与审批。不直接依赖前端实现。

import type { AgentSessionWrapper } from "../rpc-manager.js";
import type { TaskEventHub } from "./task-event-hub.js";
import type { TaskStore } from "./task-store.js";
import {
  apiError,
  type TaskCommand,
  type TaskPhase,
  type TaskState,
  type TaskStatus,
} from "./types.js";

export class TaskNotFoundError extends Error {}
export class CommandRejectedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

interface RuntimeInit {
  store: TaskStore;
  hub: TaskEventHub;
}

export function isTaskCommand(value: Record<string, unknown>): value is TaskCommand {
  const type = value.type;
  if (!type || typeof type !== "string") return false;
  switch (type) {
    case "prompt":
    case "steer":
    case "followUp":
      return typeof value.message === "string";
    case "abort":
    case "retry":
    case "complete":
    case "reopen":
    case "archive":
      return true;
    case "compact":
      return value.instructions === undefined || typeof value.instructions === "string";
    case "fork":
      return typeof value.entryId === "string";
    case "setModel":
      return typeof value.provider === "string" && typeof value.modelId === "string";
    case "setThinkingLevel":
      return typeof value.level === "string";
    case "setTools":
      return Array.isArray(value.toolNames) && value.toolNames.every((name) => typeof name === "string");
    default:
      return false;
  }
}

const RUNNING_STATUSES: ReadonlySet<TaskStatus> = new Set(["running", "waiting_approval"]);

/** 工具参数/输出摘要：限制负载长度，避免事件日志膨胀。 */
function summarizeArgs(value: unknown, truncate?: boolean): unknown {
  if (value === undefined) return undefined;
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text.length > 2000) {
    return `${text.slice(0, 2000)}…[截断，共 ${text.length} 字符]`;
  }
  if (truncate && text.length > 400) {
    return `${text.slice(0, 400)}…[截断]`;
  }
  return value;
}

export class TaskRuntime {
  private readonly store: TaskStore;
  private readonly hub: TaskEventHub;
  private readonly runWrappers = new Map<string, AgentSessionWrapper>();
  private readonly bridgedSessions = new Set<string>();

  constructor(init: RuntimeInit) {
    this.store = init.store;
    this.hub = init.hub;
  }

  // -------------------------------------------------------------------------
  // 状态机
  // -------------------------------------------------------------------------
  private transition(state: TaskState, status: TaskStatus): void {
    state.status = status;
    if (status === "completed") state.completedAt = new Date().toISOString();
    if (status === "archived") state.archivedAt = new Date().toISOString();
  }

  private attachRunWrapper(seed: { sessionId: string; cwd: string; title: string }): TaskState {
    let state = this.store.findBySession(seed.sessionId);
    if (!state) {
      state = this.store.create({ ...seed, source: "task" });
      void this.hub.emit(state.id, "task_updated", { status: state.status, phase: state.phase, currentAction: state.currentAction });
    }
    return state;
  }

  // -------------------------------------------------------------------------
  // 注册/生命周期
  // -------------------------------------------------------------------------

  /** 注册已运行的 pi 会话并挂接原始事件桥接到领域事件。 */
  attachRuntime(session: AgentSessionWrapper): TaskState {
    this.runWrappers.set(session.sessionId, session);
    let state = this.store.findBySession(session.sessionId);
    if (!state) {
      const cwd = session.cwd;
      state = this.store.create({ sessionId: session.sessionId, cwd, title: "导入的会话", source: "legacy" });
      void this.hub.emit(state.id, "task_updated", { status: state.status, phase: state.phase, imported: true });
    }
    if (!this.bridgedSessions.has(session.sessionId)) {
      this.bridgedSessions.add(session.sessionId);
      this.bridgePiEvents(session);
    }
    return state;
  }

  /** 兼容入口：importSession 与 attachRuntime 等价。 */
  importSession(session: AgentSessionWrapper): TaskState {
    return this.attachRuntime(session);
  }

  getState(taskId: string): TaskState | undefined {
    return this.store.get(taskId);
  }

  listTasks(): TaskState[] {
    return this.store.findAll();
  }

  async execCommand(taskId: string, command: TaskCommand): Promise<unknown> {
    const state = this.store.get(taskId);
    if (!state) throw new TaskNotFoundError("任务不存在");

    // 会话未必已作为运行时注册（legacy 等），交由调用方确保已注册。
    const wrapper = this.runWrappers.get(state.sessionId);

    switch (command.type) {
      case "complete": {
        if (state.status === "completed") return { ok: true, already: true };
        this.transition(state, "completed");
        state.phase = "done";
        state.currentAction = "";
        await this.hub.emit(taskId, "task_updated", { status: state.status, phase: state.phase });
        return { ok: true };
      }
      case "reopen": {
        if (state.status === "completed") {
          this.transition(state, "waiting_input");
          state.phase = "planning";
          await this.hub.emit(taskId, "task_updated", { status: state.status, phase: state.phase });
        }
        return { ok: true };
      }
      case "archive": {
        this.transition(state, "archived");
        await this.hub.emit(taskId, "task_updated", { status: state.status, archived: true });
        return { ok: true };
      }
      case "abort": {
        if (!wrapper) throw new CommandRejectedError("not_running", "任务没有正在运行的会话");
        try {
          await wrapper.send({ type: "abort" });
        } finally {
          this.toWaitingInput(state, "abort", "已中止当前运行");
        }
        return { ok: true };
      }
      case "retry": {
        // retry 语义：回到 waiting_input 并提示重新执行目标（重新发送上一条 prompt 需前端提供）。
        if (state.status === "failed") this.transition(state, "waiting_input");
        return { ok: true };
      }
      default:
        return null;
    }
  }

  /** 前端发送 prompt/steer/followUp 等并发命令时使用。 */
  async dispatchCommand(state: TaskState, command: TaskCommand): Promise<unknown> {
    const wrapper = this.runWrappers.get(state.sessionId);
    if (!wrapper) throw new CommandRejectedError("session_not_active", "会话未激活，无法执行该命令");

    switch (command.type) {
      case "prompt": {
        this.transition(state, "running");
        state.phase = "planning";
        await this.hub.emit(state.id, "task_updated", { status: state.status, phase: state.phase, currentAction: "接收你的指令" });
        const result = await wrapper.send({ type: "prompt", message: command.message, streamingBehavior: "followUp" });
        return result;
      }
      case "steer": {
        if (!RUNNING_STATUSES.has(state.status)) throw new CommandRejectedError("not_running", "任务未在运行，无法 steer");
        return wrapper.send({ type: "steer", message: command.message });
      }
      case "followUp": {
        if (!RUNNING_STATUSES.has(state.status)) throw new CommandRejectedError("not_running", "任务未在运行，无法排入 follow-up");
        return wrapper.send({ type: "follow_up", message: command.message });
      }
      case "setModel": {
        if (RUNNING_STATUSES.has(state.status)) throw new CommandRejectedError("cannot_change_while_running", "运行中禁止切换模型");
        const result = (await wrapper.send({ type: "set_model", provider: command.provider, modelId: command.modelId })) as { id?: string; provider?: string } | undefined;
        state.model = result ? { provider: result.provider ?? command.provider, modelId: result.id ?? command.modelId } : { provider: command.provider, modelId: command.modelId };
        await this.hub.emit(state.id, "task_updated", { model: state.model });
        return result;
      }
      case "setThinkingLevel": {
        if (RUNNING_STATUSES.has(state.status)) throw new CommandRejectedError("cannot_change_while_running", "运行中禁止切换思考等级");
        await wrapper.send({ type: "set_thinking_level", level: command.level });
        state.thinkingLevel = command.level;
        await this.hub.emit(state.id, "task_updated", { thinkingLevel: state.thinkingLevel });
        return { ok: true };
      }
      case "setTools": {
        if (RUNNING_STATUSES.has(state.status)) throw new CommandRejectedError("cannot_change_while_running", "运行中禁止切换工具");
        await wrapper.send({ type: "set_tools", toolNames: command.toolNames });
        state.activeToolNames = command.toolNames;
        await this.hub.emit(state.id, "task_updated", { tools: state.activeToolNames });
        return { ok: true };
      }
      case "compact": {
        await wrapper.send({ type: "compact", ...(command.instructions ? { customInstructions: command.instructions } : {}) });
        return { ok: true };
      }
      case "fork": {
        const result = (await wrapper.send({ type: "fork", entryId: command.entryId })) as { cancelled?: boolean; newSessionId?: string } | undefined;
        if (result?.newSessionId && result.newSessionId !== state.sessionId) {
          // 分支产生的会话作为新任务懒关联
          const forked = this.store.create({
            sessionId: result.newSessionId,
            cwd: state.cwd,
            title: `分支：${state.title}`,
            source: "task",
          });
          await this.hub.emit(forked.id, "task_updated", { forkOf: state.id });
          return { ok: true, newTaskId: forked.id, newSessionId: result.newSessionId };
        }
        return { ok: true, cancelled: result?.cancelled ?? false };
      }
      default:
        return this.execCommand(state.id, command);
    }
  }

  private async toWaitingInput(state: TaskState, reason: string, action: string, failed = false): Promise<void> {
    if (state.status === "archived" || state.status === "completed") return;
    this.transition(state, failed ? "failed" : "waiting_input");
    state.attentionReason = action;
    await this.hub.emit(state.id, failed ? "run_failed" : "run_settled", { reason, action });
    await this.hub.emit(state.id, "task_updated", { status: state.status, currentAction: action });
  }

  // -------------------------------------------------------------------------
  // pi 原始事件映射（由事件桥接层调用）
  // -------------------------------------------------------------------------

  /** 汇集任务的真实运行状态，供前端使用而非自行推断。 */
  reflectRun(state: TaskState, wrapper: AgentSessionWrapper | undefined): void {
    const running = wrapper?.isRunning() ?? false;
    if (running && !RUNNING_STATUSES.has(state.status)) {
      this.transition(state, "running");
      state.phase = state.phase === "done" ? "implementing" : state.phase;
    } else if (!running && (state.status === "running" || state.status === "waiting_approval")) {
      this.toWaitingInput(state, "agent_settled", "本段回答结束，等待继续", false);
    }
  }

  /**
   * 桥接 pi 原始事件到领域事件。订阅返回清理回调，连接层在关闭时调用。
   * 前端不再读取 pi 原始事件字段；领域事件由 TaskEventHub 统一分发。
   */
  bridgePiEvents(session: AgentSessionWrapper): () => void {
    const state = this.store.findBySession(session.sessionId);
    if (!state) return () => {};

    const unsubscribe = session.onEvent((event) => {
      const type = event.type;
      const taskId = state.id;
      switch (type) {
        case "agent_settled": // pi 运行已稳定结束 → 等待输入，不推断完成
          this.toWaitingInput(state, "agent_settled", "本段回答结束，等待继续", false);
          break;
        case "agent_end": // 兼容：pi 结束只意味着“等待输入”
          this.toWaitingInput(state, "agent_end", "本段回答结束，等待继续", false);
          break;
        case "prompt_error": {
          this.toWaitingInput(state, "prompt_error", String(event.errorMessage ?? "Agent 执行失败"), true);
          break;
        }
        case "message_update": {
          const msg = event.assistantMessageEvent as { type?: string; delta?: unknown } | undefined;
          if (msg?.type === "text_delta" && typeof msg.delta === "string") {
            void this.hub.emit(taskId, "message_delta", { delta: msg.delta });
          }
          // 消息完整到达时标记完成
          const messageEnd = event.assistantMessageEvent as { type?: string } | undefined;
          if (messageEnd?.type === "message_end") {
            void this.hub.emit(taskId, "message_completed", {});
          }
          break;
        }
        case "message_end": {
          void this.hub.emit(taskId, "message_completed", {});
          break;
        }
        case "tool_execution_start": {
          void this.hub.emit(taskId, "tool_started", {
            callId: event.toolCallId,
            name: event.toolName,
            args: summarizeArgs(event.args),
            startedAt: new Date().toISOString(),
          });
          break;
        }
        case "tool_execution_update": {
          void this.hub.emit(taskId, "tool_updated", {
            callId: event.toolCallId,
            name: event.toolName,
            partialResult: summarizeArgs(event.partialResult),
          });
          break;
        }
        case "tool_execution_end": {
          void this.hub.emit(taskId, "tool_finished", {
            callId: event.toolCallId,
            name: event.toolName,
            isError: Boolean((event as { isError?: boolean }).isError),
            result: summarizeArgs(event.result, true),
          });
          break;
        }
        case "compaction_start": {
          void this.hub.emit(taskId, "compaction_started", {});
          break;
        }
        case "compaction_end": {
          void this.hub.emit(taskId, "compaction_finished", {});
          break;
        }
        case "turn_start": {
          this.store.update(taskId, (s) => {
            if (s.status === "waiting_input" || s.status === "failed") s.status = "running";
          });
          break;
        }
        default:
          break;
      }
    });

    // 会话销毁时清理任务引用
    session.onDestroy(() => {
      this.runWrappers.delete(session.sessionId);
      const task = this.store.findBySession(session.sessionId);
      if (task && RUNNING_STATUSES.has(task.status)) {
        this.toWaitingInput(task, "session_destroyed", "运行会话已停止", false);
      }
    });

    return unsubscribe;
  }
}
