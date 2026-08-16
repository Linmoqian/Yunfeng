// 任务视图状态与事件归约：useTask 的纯逻辑部分。
// SSE 事件到 UI 状态的映射集中在此，便于单测与控制 hook 行数。

import type { SessionMessage, TaskState, TaskStreamEvent } from "./types";
import { approvalFromEvent, type ApprovalCard } from "./approvals";

export interface RunningTool {
  id: string;
  name: string;
}

export type TaskStreamStatus = "connecting" | "streaming" | "idle" | "error";

export interface TaskViewState {
  task: TaskState | null;
  messages: SessionMessage[];
  streamingMessage: SessionMessage | null;
  runningTools: RunningTool[];
  approvals: ApprovalCard[];
  isStreaming: boolean;
  streamStatus: TaskStreamStatus;
  notice: string | null;
  error: string | null;
}

export type TaskViewAction =
  | { type: "stream-event"; event: TaskStreamEvent }
  | { type: "open"; task: TaskState }
  | { type: "conversation"; messages: SessionMessage[] }
  | { type: "interventions"; approvals: ApprovalCard[] }
  | { type: "user-message"; message: SessionMessage }
  | { type: "close" }
  | { type: "stream-connected"; connected: boolean }
  | { type: "error"; message: string }
  | { type: "abort" }
  | { type: "retry-start" }
  | { type: "set-model"; provider: string; modelId: string }
  | { type: "resolve-approval"; requestId: string };

export const STREAMING_ID = "__streaming_assistant__";

export function initialTaskView(): TaskViewState {
  return {
    task: null,
    messages: [],
    streamingMessage: null,
    runningTools: [],
    approvals: [],
    isStreaming: false,
    streamStatus: "idle",
    notice: null,
    error: null,
  };
}

function deltaText(event: TaskStreamEvent): string | null {
  if (event.type !== "message_delta") return null;
  const data = event.data as { delta?: unknown } | undefined;
  return typeof data?.delta === "string" ? data.delta : null;
}

function deltaThinking(event: TaskStreamEvent): string | null {
  if (event.type !== "thinking_delta") return null;
  const data = event.data as { delta?: unknown } | undefined;
  return typeof data?.delta === "string" ? data.delta : null;
}

function appendStreamingBlock(state: TaskViewState, text: string | null, thinking: string | null): TaskViewState {
  const base: SessionMessage = state.streamingMessage ?? {
    id: STREAMING_ID,
    role: "assistant",
    content: [],
    timestamp: new Date().toISOString(),
  };
  const blocks = Array.isArray(base.content)
    ? [...base.content]
    : base.content
      ? [{ type: "text", text: String(base.content) }]
      : [];
  if (text) blocks.push({ type: "text", text });
  if (thinking) blocks.push({ type: "thinking", thinking });
  return { ...state, isStreaming: true, streamStatus: "streaming", streamingMessage: { ...base, content: blocks } };
}

function handleStreamEvent(state: TaskViewState, event: TaskStreamEvent): TaskViewState {
  if (event.type === "task_updated") {
    const data = event.data as Partial<TaskState> | undefined;
    if (data && typeof data === "object") {
      return { ...state, task: state.task ? { ...state.task, ...data } : state.task };
    }
    return state;
  }

  const text = deltaText(event);
  const thinking = deltaThinking(event);
  if (text || thinking) return appendStreamingBlock(state, text, thinking);

  if (event.type === "tool_started") {
    const data = event.data as { callId?: string; name?: string } | undefined;
    const callId = typeof data?.callId === "string" ? data.callId : `tool-${Date.now()}`;
    return {
      ...state,
      isStreaming: true,
      streamStatus: "streaming",
      runningTools: [
        ...state.runningTools.filter((tool) => tool.id !== callId),
        { id: callId, name: data?.name ?? "工具" },
      ],
    };
  }
  if (event.type === "tool_finished") {
    const data = event.data as { callId?: string } | undefined;
    const callId = typeof data?.callId === "string" ? data.callId : "";
    if (!callId) return state;
    return { ...state, runningTools: state.runningTools.filter((tool) => tool.id !== callId) };
  }
  if (event.type === "run_failed") {
    const data = event.data as { action?: string } | undefined;
    return {
      ...state,
      error: data?.action ?? "Agent 执行失败",
      isStreaming: false,
      streamStatus: "error",
      runningTools: [],
    };
  }
  if (event.type === "message_completed" || event.type === "run_settled" || event.type === "agent_end") {
    const identity =
      typeof event.id === "string" && event.id
        ? event.id
        : typeof event.seq === "number"
          ? String(event.seq)
          : crypto.randomUUID();
    const committed = state.streamingMessage;
    return {
      ...state,
      messages: committed ? [...state.messages, { ...committed, id: `assistant-${identity}` }] : state.messages,
      streamingMessage: null,
      isStreaming: false,
      streamStatus: "idle",
      runningTools: [],
    };
  }
  if (event.type === "approval_requested") {
    const card = approvalFromEvent(event.data);
    if (!card) return state;
    return {
      ...state,
      approvals: [...state.approvals.filter((item) => item.requestId !== card.requestId), card],
      notice: card.title,
    };
  }
  if (event.type === "approval_resolved") {
    const data = event.data as { requestId?: string } | undefined;
    if (!data?.requestId) return state;
    return {
      ...state,
      approvals: state.approvals.filter((item) => item.requestId !== data.requestId),
      notice: null,
    };
  }
  return state;
}

export function taskViewReducer(state: TaskViewState, action: TaskViewAction): TaskViewState {
  switch (action.type) {
    case "stream-event":
      return handleStreamEvent(state, action.event);
    case "open":
      return { ...initialTaskView(), task: action.task, streamStatus: "connecting" };
    case "conversation":
      return { ...state, messages: action.messages };
    case "interventions":
      return { ...state, approvals: action.approvals };
    case "user-message":
      return { ...state, error: null, messages: [...state.messages, action.message] };
    case "close":
      return initialTaskView();
    case "stream-connected":
      return { ...state, streamStatus: action.connected ? "idle" : "connecting" };
    case "error":
      return { ...state, error: action.message };
    case "abort":
      return { ...state, isStreaming: false, streamStatus: "idle" };
    case "retry-start":
      return { ...state, error: null, streamStatus: "connecting" };
    case "set-model":
      return {
        ...state,
        task: state.task ? { ...state.task, model: { provider: action.provider, modelId: action.modelId } } : state.task,
      };
    case "resolve-approval":
      return {
        ...state,
        approvals: state.approvals.filter((item) => item.requestId !== action.requestId),
        notice: null,
      };
  }
}
