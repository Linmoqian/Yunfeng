// TaskRuntime：把 pi 运行时会话适配到任务领域。
// 负责状态机、命令执行、事件映射与审批。不直接依赖前端实现。

import { randomUUID } from "node:crypto";
import type { AgentSessionWrapper } from "../rpc-manager.js";
import type { TaskEventHub } from "./task-event-hub.js";
import type { TaskStore } from "./task-store.js";
import {
  registerInterventionHandler,
  type ConfirmRequest,
  type InputRequest,
  type SelectRequest,
} from "./intervention-bridge.js";
import {
  apiError,
  type TaskCommand,
  type TaskIntervention,
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
    case "clearQueue":
    case "getQueue":
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
  private readonly interventionResolvers = new Map<string, (value: string | boolean | null | undefined) => void>();
  private readonly approvalActions = new Map<string, () => Promise<{ ok: boolean; message?: string }>>();

  constructor(init: RuntimeInit) {
    this.store = init.store;
    this.hub = init.hub;
    // 服务重启：未决 UI 审批全部标记失效，绝不自动放行
    for (const task of this.store.findAll()) {
      if (task.pendingApprovalIds.length > 0 || this.store.listInterventions(task.id).some((item) => item.status === "pending")) {
        this.invalidateInterventionsForTask(task.id);
      }
    }
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
    // 注册干预 handler，供 pi 扩展的 confirm/select/input 接入审批流
    this.registerHandlerFor(session.sessionId, state.id);
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
        const result = await wrapper.send({
          type: "prompt",
          message: command.message,
          ...(command.images?.length ? { images: command.images } : {}),
          streamingBehavior: "followUp",
        });
        return result;
      }
      case "steer": {
        if (!RUNNING_STATUSES.has(state.status)) throw new CommandRejectedError("not_running", "任务未在运行，无法 steer");
        return wrapper.send({
          type: "steer",
          message: command.message,
          ...(command.images?.length ? { images: command.images } : {}),
        });
      }
      case "followUp": {
        if (!RUNNING_STATUSES.has(state.status)) throw new CommandRejectedError("not_running", "任务未在运行，无法排入 follow-up");
        return wrapper.send({
          type: "follow_up",
          message: command.message,
          ...(command.images?.length ? { images: command.images } : {}),
        });
      }
      case "clearQueue": {
        const result = await wrapper.send({ type: "clear_queue" });
        await this.hub.emit(state.id, "queue_updated", { cleared: true });
        return result;
      }
      case "getQueue": {
        const stateResult = (await wrapper.send({ type: "get_state" })) as { queuedMessages?: { steering?: unknown[]; followUp?: unknown[] } } | undefined;
        return {
          steering: stateResult?.queuedMessages?.steering ?? [],
          followUp: stateResult?.queuedMessages?.followUp ?? [],
        };
      }      case "setModel": {
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
        case "queue_update": {
          void this.hub.emit(taskId, "queue_updated", { changed: true, at: new Date().toISOString() });
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

  // -------------------------------------------------------------------------
  // 审批/介入
  // -------------------------------------------------------------------------

  private registerHandlerFor(sessionId: string, taskId: string): () => void {
    const requestConfirm = async (request: ConfirmRequest): Promise<boolean> => {
      const intervention = await this.createIntervention(taskId, {
        kind: "confirm",
        title: request.title || "确认操作",
        message: request.message || "",
        safeLabel: request.safeLabel,
        impact: request.impact,
      });
      const value = await this.waitForIntervention(intervention.id);
      return value === true;
    };
    const requestSelect = async (request: SelectRequest): Promise<string | undefined> => {
      const intervention = await this.createIntervention(taskId, {
        kind: "select",
        title: request.title || "选择一项",
        message: request.message || "",
        options: request.options,
        defaultValue: request.defaultValue,
      });
      const value = await this.waitForIntervention(intervention.id);
      return typeof value === "string" ? value : undefined;
    };
    const requestInput = async (request: InputRequest): Promise<string | undefined> => {
      const intervention = await this.createIntervention(taskId, {
        kind: "input",
        title: request.title || "输入文本",
        message: request.message || "",
        defaultValue: request.defaultValue,
      });
      const value = await this.waitForIntervention(intervention.id);
      return typeof value === "string" ? value : undefined;
    };

    return registerInterventionHandler(sessionId, {
      requestConfirm,
      requestSelect,
      requestInput,
      invalidatePending: (requestId) => { void requestId; },
    });
  }

  async createIntervention(taskId: string, input: {
    kind: TaskIntervention["kind"];
    title: string;
    message: string;
    safeLabel?: string;
    impact?: string;
    options?: string[];
    defaultValue?: string;
    /** 批准后自动执行的动作（如 push）。 */
    action?: () => Promise<{ ok: boolean; message?: string }>;
  }): Promise<TaskIntervention> {
    const now = new Date().toISOString();
    const intervention: TaskIntervention = {
      id: randomUUID(),
      taskId,
      kind: input.kind,
      title: input.title,
      message: input.message,
      ...(input.options && input.options.length ? { options: input.options } : {}),
      ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
      ...(input.safeLabel ? { safeLabel: input.safeLabel } : {}),
      ...(input.impact ? { impact: input.impact } : {}),
      status: "pending",
      createdAt: now,
    };
    if (input.action) {
      this.approvalActions.set(intervention.id, input.action);
    }
    this.store.appendIntervention(intervention);
    // 任务进入等待审批，并把请求 id 记入待决列表
    this.store.update(taskId, (state) => {
      if (!state.pendingApprovalIds.includes(intervention.id)) {
        state.pendingApprovalIds.push(intervention.id);
      }
      if (state.status !== "running") state.status = "waiting_approval";
    });
    await this.hub.emit(taskId, "approval_requested", {
      requestId: intervention.id,
      kind: intervention.kind,
      title: intervention.title,
      message: intervention.message,
      safeLabel: intervention.safeLabel,
      impact: intervention.impact,
      options: intervention.options,
    });
    await this.hub.emit(taskId, "task_updated", { status: "waiting_approval", pendingApprovalIds: [intervention.id] });
    return intervention;
  }

  private async waitForIntervention(requestId: string): Promise<string | boolean | null | undefined> {
    const resolution = new Promise<string | boolean | null | undefined>((resolve) => {
      this.interventionResolvers.set(requestId, resolve);
    });
    return resolution;
  }

  listInterventions(taskId: string): TaskIntervention[] {
    return this.store.listInterventions(taskId)
      .filter((item) => item.status === "pending")
      .map((item) => ({ ...item, status: "pending" as const }));
  }

  /** 记录任务初始 Git 基线（异步、失败不影响任务创建）。 */
  async recordGitBaseline(taskId: string): Promise<void> {
    const state = this.store.get(taskId);
    if (!state || state.gitBaseline) return;
    try {
      const { getTaskChanges } = await import("../git-operations.js");
      const { files } = await getTaskChanges(state.cwd);
      this.store.update(taskId, (s) => {
        s.gitBaseline = files.map((file) => file.filePath);
      });
      await this.hub.emit(taskId, "git_changed", { baseline: state.gitBaseline });
    } catch {
      // 非 Git 仓库或读取失败：不阻断任务创建
    }
  }

  /** 提交审批结果。返回是否被解析（false 表示请求不存在或已失效）。 */
  resolveIntervention(taskId: string, requestId: string, value: string | boolean | null): { ok: boolean; reason?: string } {
    const storeItem = this.store.listInterventions(taskId).find((item) => item.id === requestId);
    if (!storeItem || storeItem.status === "resolved") return { ok: false, reason: storeItem ? "already_resolved" : "not_found" };

    const updated: TaskIntervention = {
      ...storeItem,
      value,
      status: "resolved",
      resolvedAt: new Date().toISOString(),
    };
    this.store.updateIntervention(updated);
    const resolve = this.interventionResolvers.get(requestId);
    if (resolve) {
      this.interventionResolvers.delete(requestId);
      resolve(value);
    }
    // 若该审批绑定了批准后动作（如 push），且被批准，则执行
    if (value === true) {
      const action = this.approvalActions.get(requestId);
      if (action) {
        this.approvalActions.delete(requestId);
        void action().then((actionResult) => {
          if (!actionResult.ok) {
            void this.hub.emit(taskId, "git_changed", { pushFailed: actionResult.message });
          } else {
            void this.hub.emit(taskId, "git_changed", { pushed: true });
          }
        }).catch((error: unknown) => {
          void this.hub.emit(taskId, "git_changed", { pushFailed: error instanceof Error ? error.message : String(error) });
        });
      }
    } else {
      this.approvalActions.delete(requestId);
    }
    // 从任务待决列表移除；若无其他待决，任务回到等待态
    this.store.update(taskId, (state) => {
      state.pendingApprovalIds = state.pendingApprovalIds.filter((id) => id !== requestId);
      if (state.pendingApprovalIds.length === 0 && state.status === "waiting_approval") {
        state.status = value === true ? "running" : "waiting_input";
        state.currentAction = value === true ? "审批通过，继续执行" : "审批已拒绝";
      }
    });
    void this.hub.emit(taskId, "approval_resolved", { requestId, value });
    void this.hub.emit(taskId, "task_updated", { pendingApprovalIds: this.store.get(taskId)?.pendingApprovalIds ?? [] });
    return { ok: true };
  }

  /** 服务重启或任务失效：把未决审批标记为 timed_out（绝不自动放行）。 */
  invalidateInterventionsForTask(taskId: string): void {
    for (const item of this.store.listInterventions(taskId)) {
      if (item.status === "pending") {
        const updated = { ...item, status: "timed_out" as const, resolvedAt: new Date().toISOString() };
        this.store.updateIntervention(updated);
        const resolve = this.interventionResolvers.get(item.id);
        if (resolve) {
          this.interventionResolvers.delete(item.id);
          resolve(null);
        }
      }
    }
    this.store.update(taskId, (state) => {
      state.pendingApprovalIds = [];
      if (state.status === "waiting_approval") {
        state.status = "waiting_input";
        state.currentAction = "待审批项已失效，请重新执行";
      }
    });
  }
}

