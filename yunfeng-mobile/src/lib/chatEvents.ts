// 会话事件归约：把 sidecar AgentEvent 与内部动作映射为聊天 UI 状态（与 app/useSession 同语义）。

import type { AgentEvent, SessionMessage } from "./types";

export interface RunningTool {
  id: string;
  name: string;
}

export interface ChatState {
  messages: SessionMessage[];
  streamingMessage: SessionMessage | null;
  runningTools: RunningTool[];
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
  runningTools: [],
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
      return {
        ...state,
        runningTools: state.runningTools.some((t) => t.id === id)
          ? state.runningTools
          : [...state.runningTools, { id, name }],
      };
    }
    case "tool_execution_end": {
      const id = action.toolCallId as string;
      return { ...state, runningTools: state.runningTools.filter((t) => t.id !== id) };
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
