import { useCallback, useEffect, useRef, useState } from "react";
import type { SidecarClient } from "../lib/api";
import type { AgentEvent, SessionInfo, SessionMessage, SessionState } from "../lib/types";

interface RunningTool {
  id: string;
  name: string;
}

export interface UseSessionResult {
  rpcSessionId: string | null;
  session: SessionInfo | null;
  messages: SessionMessage[];
  streamingMessage: SessionMessage | null;
  runningTools: RunningTool[];
  isStreaming: boolean;
  isCompacting: boolean;
  state: SessionState | null;
  error: string | null;
  openSession: (session: SessionInfo, cwd: string) => Promise<void>;
  newSession: (cwd: string) => Promise<void>;
  closeSession: () => void;
  sendPrompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  refreshContext: () => Promise<void>;
}

export function useSession(client: SidecarClient | null): UseSessionResult {
  const [rpcSessionId, setRpcSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<SessionMessage | null>(null);
  const [runningTools, setRunningTools] = useState<RunningTool[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef(client);
  clientRef.current = client;
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const refreshContext = useCallback(async () => {
    const c = clientRef.current;
    if (!c || !rpcSessionId) return;
    try {
      const ctx = await c.getSessionContext(rpcSessionId);
      setMessages(ctx.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [rpcSessionId]);

  const openSession = useCallback(
    async (target: SessionInfo, cwd: string) => {
      const c = clientRef.current;
      if (!c) throw new Error("sidecar 未启动");

      // 停止旧订阅
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setMessages([]);
      setStreamingMessage(null);
      setRunningTools([]);
      setIsStreaming(false);
      setError(null);

      const startOpts: {
        sessionId?: string;
        sessionFile?: string;
        cwd: string;
      } = { cwd };
      if (target.path) {
        startOpts.sessionId = target.id;
        startOpts.sessionFile = target.path;
      }

      const { sessionId } = await c.startSession(startOpts);
      setRpcSessionId(sessionId);
      setSession(target);

      // 加载历史上下文
      const ctx = await c.getSessionContext(sessionId);
      setMessages(ctx.messages ?? []);

      // 订阅事件流
      unsubscribeRef.current = c.subscribeEvents(
        sessionId,
        (event: AgentEvent) => {
          switch (event.type) {
            case "message_start":
            case "message_update": {
              const msg = event.message as SessionMessage | undefined;
              if (!msg || msg.role === "user") break;
              setStreamingMessage(msg);
              setIsStreaming(true);
              break;
            }
            case "message_end": {
              const completed = event.message as SessionMessage | undefined;
              if (completed) {
                setMessages((prev) => [...prev, completed]);
              }
              setStreamingMessage(null);
              setIsStreaming(false);
              break;
            }
            case "tool_execution_start": {
              const id = event.toolCallId as string;
              const name = event.toolName as string;
              setRunningTools((prev) =>
                prev.some((t) => t.id === id) ? prev : [...prev, { id, name }],
              );
              break;
            }
            case "tool_execution_end": {
              const id = event.toolCallId as string;
              setRunningTools((prev) => prev.filter((t) => t.id !== id));
              break;
            }
            case "compaction_start":
              setIsCompacting(true);
              break;
            case "compaction_end":
              setIsCompacting(false);
              void refreshContext();
              break;
            case "agent_end":
            case "prompt_done":
              setIsStreaming(false);
              void refreshContext();
              break;
            case "prompt_error":
              setError((event.errorMessage as string | undefined) ?? "prompt 失败");
              setIsStreaming(false);
              break;
            default:
              break;
          }
        },
        (e) => setError(e.message),
      );

      // 拉取状态快照
      try {
        const st = (await c.sendCommand<SessionState>(sessionId, { type: "get_state" })) as SessionState;
        setState(st);
      } catch {
        // 状态快照失败不影响主流程
      }
    },
    [refreshContext],
  );

  const newSession = useCallback(
    async (cwd: string) => {
      const c = clientRef.current;
      if (!c) throw new Error("sidecar 未启动");
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setMessages([]);
      setStreamingMessage(null);
      setRunningTools([]);
      setIsStreaming(false);
      setError(null);
      setSession(null);

      const { sessionId } = await c.startSession({ cwd });
      setRpcSessionId(sessionId);
      setSession({ id: sessionId, path: "", cwd, name: "新会话", created: "", modified: "", messageCount: 0, firstMessage: "", parentSessionId: undefined, projectRoot: cwd } satisfies SessionInfo);
      setMessages([]);

      unsubscribeRef.current = c.subscribeEvents(sessionId, (event: AgentEvent) => {
        switch (event.type) {
          case "message_start":
          case "message_update": {
            const msg = event.message as SessionMessage | undefined;
            if (!msg || msg.role === "user") break;
            setStreamingMessage(msg);
            setIsStreaming(true);
            break;
          }
          case "message_end": {
            const completed = event.message as SessionMessage | undefined;
            if (completed) setMessages((prev) => [...prev, completed]);
            setStreamingMessage(null);
            setIsStreaming(false);
            break;
          }
          case "tool_execution_start": {
            const id = event.toolCallId as string;
            const name = event.toolName as string;
            setRunningTools((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, name }]));
            break;
          }
          case "tool_execution_end": {
            const id = event.toolCallId as string;
            setRunningTools((prev) => prev.filter((t) => t.id !== id));
            break;
          }
          case "compaction_start":
            setIsCompacting(true);
            break;
          case "compaction_end":
            setIsCompacting(false);
            void refreshContext();
            break;
          case "agent_end":
          case "prompt_done":
            setIsStreaming(false);
            void refreshContext();
            break;
          case "prompt_error":
            setError((event.errorMessage as string | undefined) ?? "prompt 失败");
            setIsStreaming(false);
            break;
          default:
            break;
        }
      });
    },
    [refreshContext],
  );

  const closeSession = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setRpcSessionId(null);
    setSession(null);
    setMessages([]);
    setStreamingMessage(null);
    setRunningTools([]);
    setIsStreaming(false);
    setState(null);
  }, []);

  const sendPrompt = useCallback(
    async (text: string) => {
      const c = clientRef.current;
      if (!c || !rpcSessionId) return;
      setError(null);
      // 乐观追加用户消息
      const userMsg: SessionMessage = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      await c.sendCommand(rpcSessionId, { type: "prompt", message: text, streamingBehavior: "followUp" });
    },
    [rpcSessionId],
  );

  const abort = useCallback(async () => {
    const c = clientRef.current;
    if (!c || !rpcSessionId) return;
    await c.sendCommand(rpcSessionId, { type: "abort" });
    setIsStreaming(false);
    void refreshContext();
  }, [rpcSessionId, refreshContext]);

  const setModel = useCallback(
    async (provider: string, modelId: string) => {
      const c = clientRef.current;
      if (!c || !rpcSessionId) return;
      await c.sendCommand(rpcSessionId, { type: "set_model", provider, modelId });
      const st = (await c.sendCommand<SessionState>(rpcSessionId, { type: "get_state" })) as SessionState;
      setState(st);
    },
    [rpcSessionId],
  );

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  return {
    rpcSessionId,
    session,
    messages,
    streamingMessage,
    runningTools,
    isStreaming,
    isCompacting,
    state,
    error,
    openSession,
    newSession,
    closeSession,
    sendPrompt,
    abort,
    setModel,
    refreshContext,
  };
}
