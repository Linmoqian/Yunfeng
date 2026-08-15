// 单任务视图：对话加载、发送指令与事件流订阅。
// 流式增量来自网关 SSE，历史消息来自 /api/tasks/:id/conversation。

import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayClient } from "../lib/gateway";
import type { SessionMessage, TaskState, TaskStreamEvent } from "../lib/types";

interface RunningTool {
  id: string;
  name: string;
}

export interface ApprovalCard {
  requestId: string;
  kind: "confirm" | "select" | "input";
  title: string;
  message: string;
  safeLabel?: string;
  impact?: string;
  options?: string[];
}

export type TaskStreamStatus = "connecting" | "streaming" | "idle" | "error";

export interface UseTaskResult {
  task: TaskState | null;
  messages: SessionMessage[];
  streamingMessage: SessionMessage | null;
  runningTools: RunningTool[];
  approvals: ApprovalCard[];
  isStreaming: boolean;
  streamStatus: TaskStreamStatus;
  notice: string | null;
  error: string | null;
  openTask: (task: TaskState) => Promise<void>;
  closeTask: () => void;
  sendPrompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  retry: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  resolveApproval: (requestId: string, decision: "approve" | "reject", value?: string) => Promise<void>;
  refreshConversation: () => Promise<void>;
}

const STREAMING_ID = "__streaming_assistant__";

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

function approvalFromEvent(data: unknown): ApprovalCard | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<ApprovalCard>;
  if (typeof raw.requestId !== "string") return null;
  return {
    requestId: raw.requestId,
    kind: raw.kind ?? "confirm",
    title: raw.title ?? "Agent 请求审批",
    message: raw.message ?? "",
    ...(raw.safeLabel ? { safeLabel: raw.safeLabel } : {}),
    ...(raw.impact ? { impact: raw.impact } : {}),
    ...(raw.options ? { options: raw.options } : {}),
  };
}

export function useTask(client: GatewayClient | null): UseTaskResult {
  const [task, setTask] = useState<TaskState | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<SessionMessage | null>(null);
  const [runningTools, setRunningTools] = useState<RunningTool[]>([]);
  const [approvals, setApprovals] = useState<ApprovalCard[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState<TaskStreamStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef(client);
  clientRef.current = client;
  const taskRef = useRef<TaskState | null>(task);
  taskRef.current = task;
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const refreshConversation = useCallback(async () => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current) return;
    try {
      setMessages(await c.loadTaskConversation(current.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleEvent = useCallback((event: TaskStreamEvent) => {
    if (event.type === "task_updated") {
      const data = event.data as Partial<TaskState> | undefined;
      if (data && typeof data === "object") {
        setTask((current) => (current ? { ...current, ...data } : current));
      }
      return;
    }

    const text = deltaText(event);
    const thinking = deltaThinking(event);
    if (text || thinking) {
      setIsStreaming(true);
      setStreamStatus("streaming");
      setStreamingMessage((current) => {
        const base: SessionMessage = current ?? {
          id: STREAMING_ID,
          role: "assistant",
          content: [],
          timestamp: new Date().toISOString(),
        };
        const blocks = Array.isArray(base.content) ? [...base.content] : base.content ? [{ type: "text", text: String(base.content) }] : [];
        if (text) blocks.push({ type: "text", text });
        if (thinking) blocks.push({ type: "thinking", thinking });
        return { ...base, content: blocks };
      });
    }

    if (event.type === "tool_started") {
      const data = event.data as { callId?: string; name?: string } | undefined;
      const callId = typeof data?.callId === "string" ? data.callId : `tool-${Date.now()}`;
      setIsStreaming(true);
      setStreamStatus("streaming");
      setRunningTools((current) => [
        ...current.filter((tool) => tool.id !== callId),
        { id: callId, name: data?.name ?? "工具" },
      ]);
    }
    if (event.type === "tool_finished") {
      const data = event.data as { callId?: string } | undefined;
      const callId = typeof data?.callId === "string" ? data.callId : "";
      if (callId) setRunningTools((current) => current.filter((tool) => tool.id !== callId));
    }
    if (event.type === "run_failed") {
      const data = event.data as { action?: string } | undefined;
      setError(data?.action ?? "Agent 执行失败");
      setIsStreaming(false);
      setStreamStatus("error");
      setRunningTools([]);
    }
    if (event.type === "message_completed" || event.type === "run_settled" || event.type === "agent_end") {
      const identity = typeof event.id === "string" && event.id
        ? event.id
        : typeof event.seq === "number"
          ? String(event.seq)
          : crypto.randomUUID();
      setStreamingMessage((current) => {
        if (current) {
          setMessages((prev) => [...prev, { ...current, id: `assistant-${identity}` }]);
        }
        return null;
      });
      setIsStreaming(false);
      setStreamStatus("idle");
      setRunningTools([]);
    }
    if (event.type === "approval_requested") {
      const card = approvalFromEvent(event.data);
      if (card) {
        setApprovals((current) => [...current.filter((item) => item.requestId !== card.requestId), card]);
        setNotice(card.title);
      }
    }
    if (event.type === "approval_resolved") {
      const data = event.data as { requestId?: string } | undefined;
      if (data?.requestId) {
        setApprovals((current) => current.filter((item) => item.requestId !== data.requestId));
        setNotice(null);
      }
    }
  }, []);

  const openTask = useCallback(async (next: TaskState) => {
    const c = clientRef.current;
    if (!c) {
      setError("网关未配置");
      return;
    }
    unsubscribeRef.current?.();
    taskRef.current = next;
    setTask(next);
    setMessages([]);
    setStreamingMessage(null);
    setRunningTools([]);
    setApprovals([]);
    setIsStreaming(false);
    setStreamStatus("connecting");
    setNotice(null);
    setError(null);
    try {
      const [conversation, interventions] = await Promise.all([
        c.loadTaskConversation(next.id),
        c.loadTaskInterventions(next.id),
      ]);
      setMessages(conversation);
      setApprovals(
        interventions
          .filter((item) => item.status === "pending")
          .map((item) => ({
            requestId: item.id,
            kind: item.kind,
            title: item.title,
            message: item.message,
            ...(item.safeLabel ? { safeLabel: item.safeLabel } : {}),
            ...(item.impact ? { impact: item.impact } : {}),
            ...(item.options ? { options: item.options } : {}),
          })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    unsubscribeRef.current = c.subscribeTaskEvents(
      next.id,
      handleEvent,
      (connected) => setStreamStatus(connected ? "idle" : "connecting"),
    );
  }, [handleEvent]);

  const closeTask = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setTask(null);
    setMessages([]);
    setStreamingMessage(null);
    setRunningTools([]);
    setApprovals([]);
    setIsStreaming(false);
    setStreamStatus("idle");
    setNotice(null);
    setError(null);
  }, []);

  const sendPrompt = useCallback(async (text: string) => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current || text.trim() === "") return;
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: text, timestamp: new Date().toISOString() },
    ]);
    try {
      await c.sendTaskCommand(current.id, { type: "prompt", message: text });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const abort = useCallback(async () => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current) return;
    try {
      await c.sendTaskCommand(current.id, { type: "abort" });
      setIsStreaming(false);
      setStreamStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const retry = useCallback(async () => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (c === null || current === null) return;
    setError(null);
    setStreamStatus("connecting");
    try {
      await c.sendTaskCommand(current.id, { type: "retry" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const resolveApproval = useCallback(async (requestId: string, decision: "approve" | "reject", value?: string) => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (c === null || current === null) return;
    setApprovals((prev) => prev.filter((item) => item.requestId !== requestId));
    try {
      await c.resolveIntervention(current.id, requestId, decision, value);
      setNotice(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void openTask(current);
    }
  }, [openTask]);

  const setModel = useCallback(async (provider: string, modelId: string) => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current) return;
    try {
      await c.sendTaskCommand(current.id, { type: "setModel", provider, modelId });
      setTask((prev) => (prev ? { ...prev, model: { provider, modelId } } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  return {
    task,
    messages,
    streamingMessage,
    runningTools,
    approvals,
    isStreaming,
    streamStatus,
    notice,
    error,
    openTask,
    closeTask,
    sendPrompt,
    abort,
    retry,
    setModel,
    resolveApproval,
    refreshConversation,
  };
}
