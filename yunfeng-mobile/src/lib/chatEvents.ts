// 会话事件归约：把 sidecar AgentEvent 与内部动作映射为聊天 UI 状态（与 app/useSession 同语义）。

import type { AgentEvent, SessionMessage } from "./types";

export type ToolStatus = "running" | "done" | "failed";

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
