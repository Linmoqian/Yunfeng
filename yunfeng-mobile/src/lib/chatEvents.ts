// 会话事件归约：把 sidecar AgentEvent 与内部动作映射为聊天 UI 状态（与 app/useSession 同语义）。

import type { AgentEvent, SessionMessage } from "./types";

export type ToolStatus = "running" | "done" | "failed";

export type TaskStatus = "pending" | "running" | "done" | "failed";

/** 任务拆解子任务（主管拆解后的执行单元）。 */
export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  detail?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  status: ToolStatus;
  /** 运行中的进度说明 */
  message?: string;
  /** 完成结果摘要 */
  result?: string;
  /** 失败原因 */
  error?: string;
}

export interface ChatState {
  messages: SessionMessage[];
  streamingMessage: SessionMessage | null;
  tools: ToolCall[];
  tasks: TaskItem[];
  isStreaming: boolean;
  error: string | null;
}

export type ChatAction =
  | AgentEvent
  | { type: "reset" }
  | { type: "user_message"; message: SessionMessage };

export const initialChatState: ChatState = {
  messages: [],
  streamingMessage: null,
  tools: [],
  tasks: [],
  isStreaming: false,
  error: null,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "reset":
      return initialChatState;
    case "user_message":
      return { ...state, messages: [...state.messages, action.message as SessionMessage] };
    case "message_update": {
      const msg = action.message as SessionMessage | undefined;
      if (!msg || msg.role === "user") return state;
      return { ...state, streamingMessage: msg, isStreaming: true, error: null };
    }
    case "message_end": {
      const completed = action.message as SessionMessage | undefined;
      return {
        ...state,
        messages: completed ? [...state.messages, completed] : state.messages,
        streamingMessage: null,
        isStreaming: false,
      };
    }
    case "tool_execution_start": {
      const id = action.toolCallId as string;
      const name = action.toolName as string;
      if (state.tools.some((t) => t.id === id)) return state;
      return { ...state, tools: [...state.tools, { id, name, status: "running" }] };
    }
    case "tool_execution_update": {
      const id = action.toolCallId as string;
      const message = action.message as string | undefined;
      if (!message) return state;
      return {
        ...state,
        tools: state.tools.map((t) => (t.id === id ? { ...t, message } : t)),
      };
    }
    case "tool_execution_end": {
      const id = action.toolCallId as string;
      const result = action.result as string | undefined;
      return {
        ...state,
        tools: state.tools.map((t) => (t.id === id ? { ...t, status: "done", result } : t)),
      };
    }
    case "tool_execution_error": {
      const id = action.toolCallId as string;
      const error = (action.errorMessage as string | undefined) ?? "工具执行失败";
      return {
        ...state,
        tools: state.tools.map((t) => (t.id === id ? { ...t, status: "failed", error } : t)),
      };
    }
    case "task_plan": {
      const tasks = action.tasks as TaskItem[] | undefined;
      if (!Array.isArray(tasks)) return state;
      return {
        ...state,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status ?? "pending",
          detail: t.detail,
        })),
      };
    }
    case "task_update": {
      const id = action.taskId as string;
      const status = action.status as TaskStatus | undefined;
      const detail = action.detail as string | undefined;
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                status: status ?? t.status,
                detail: detail ?? t.detail,
              }
            : t,
        ),
      };
    }
    case "agent_end":
    case "prompt_done":
      return { ...state, isStreaming: false };
    case "prompt_error":
      return {
        ...state,
        error: (action.errorMessage as string | undefined) ?? "prompt 失败",
        isStreaming: false,
      };
    default:
      return state;
  }
}
