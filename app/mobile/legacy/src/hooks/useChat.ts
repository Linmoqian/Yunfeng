// 移动端流式会话 hook：启动会话、订阅 SSE、发送/停止/重试。
// 事件归约复用 chatReducer（与 app/useSession 同语义）。

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { SidecarClient } from "@/lib/api";
import { chatReducer, initialChatState, type TaskItem, type ToolCall } from "@/lib/chatEvents";
import type { AgentEvent, SessionMessage, SessionState } from "@/lib/types";

export interface UseChatResult {
  sessionId: string | null;
  messages: SessionMessage[];
  streamingMessage: SessionMessage | null;
  tools: ToolCall[];
  tasks: TaskItem[];
  isStreaming: boolean;
  error: string | null;
  state: SessionState | null;
  open: () => Promise<string | null>;
  close: () => void;
  sendPrompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  retryLast: () => Promise<void>;
}

export function useChat(
  client: SidecarClient | null,
  opts?: { onEvent?: (event: AgentEvent) => void },
): UseChatResult {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rpcState, setRpcState] = useState<SessionState | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastPromptRef = useRef<string | null>(null);
  const onEventRef = useRef(opts?.onEvent);
  onEventRef.current = opts?.onEvent;

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  const open = useCallback(async (): Promise<string | null> => {
    const c = client;
    if (!c) return null;
    if (sessionId) return sessionId;
    unsubscribeRef.current?.();
    dispatch({ type: "reset" });
    const { sessionId: sid } = await c.startSession({ cwd: "~" });
    setSessionId(sid);
    unsubscribeRef.current = c.subscribeEvents(
      sid,
      (event) => {
        onEventRef.current?.(event);
        dispatch(event);
      },
      (err) => dispatch({ type: "prompt_error", errorMessage: err.message }),
    );
    return sid;
  }, [client, sessionId]);

  const close = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setSessionId(null);
    setRpcState(null);
    dispatch({ type: "reset" });
  }, []);

  const sendPrompt = useCallback(
    async (text: string) => {
      const c = client;
      const t = text.trim();
      if (!c || !t || state.isStreaming) return;
      let sid = sessionId;
      if (!sid) sid = await open();
      if (!sid) return;
      lastPromptRef.current = t;
      const userMsg: SessionMessage = {
        role: "user",
        content: t,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "user_message", message: userMsg });
      try {
        await c.sendCommand(sid, { type: "prompt", message: t, streamingBehavior: "followUp" });
      } catch (err) {
        dispatch({
          type: "prompt_error",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [client, open, sessionId, state.isStreaming],
  );

  const abort = useCallback(async () => {
    const c = client;
    if (!c || !sessionId) return;
    try {
      await c.sendCommand(sessionId, { type: "abort" });
    } catch {
      // 停止失败不阻塞本地状态
    }
    dispatch({ type: "prompt_done" });
  }, [client, sessionId]);

  const retryLast = useCallback(async () => {
    const last = lastPromptRef.current;
    if (!last) return;
    void sendPrompt(last);
  }, [sendPrompt]);

  return {
    sessionId,
    messages: state.messages,
    streamingMessage: state.streamingMessage,
    tools: state.tools,
    tasks: state.tasks,
    isStreaming: state.isStreaming,
    error: state.error,
    state: rpcState,
    open,
    close,
    sendPrompt,
    abort,
    retryLast,
  };
}
