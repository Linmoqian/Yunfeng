// 任务聚焦面板的事件流 Hook：聚合会话输出、工具调用、审批与任务状态变更。
// 通过 EventSource 订阅单任务事件，将增量状态写入本地（Rust 后端仍是事实来源）。

import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadTaskConversation,
  loadSessionConversation,
  loadTaskInterventions,
  subscribeTaskEvents,
  type SessionSnapshot,
  type TaskState,
  type TaskStreamEvent,
} from "../../../services/taskService";
import {
  getTextDelta,
  getThinkingDelta,
  mergeConversation,
  normalizeConversationMessage,
  STREAMING_MESSAGE_ID,
  type ApprovalInfo,
  type ConversationItem,
  type ToolCallInfo,
} from "../components/ConversationLog";

export type StreamStatus = "connecting" | "idle" | "streaming" | "error";
export type ApprovalKind = "confirm" | "select" | "input";

export interface StreamHandlerOptions {
  task?: TaskState;
  legacySession?: SessionSnapshot;
  isLegacy: boolean;
  sessionId: string;
  onTaskUpdated: (task: TaskState) => void;
}

export interface StreamResult {
  activeTask: TaskState | null;
  setLocalTask: React.Dispatch<React.SetStateAction<TaskState | null>>;
  conversation: ConversationItem[];
  conversationLoading: boolean;
  streamStatus: StreamStatus;
  streamError: string | null;
  toolActivity: string | null;
  toolCalls: ToolCallInfo[];
  approvals: ApprovalInfo[];
  /** 更新某条消息的发送状态。 */
  setMessageStatus: (id: string, status: NonNullable<ConversationItem["status"]>) => void;
  /** 移除一条待审批。 */
  removeApproval: (requestId: string) => void;
  /** 追加乐观用户消息并返回其 id（发送流程封装）。 */
  beginOptimisticSend: (text: string) => string;
}

export function useTaskStream({ task, isLegacy, sessionId, onTaskUpdated }: StreamHandlerOptions): StreamResult {
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [approvals, setApprovals] = useState<ApprovalInfo[]>([]);
  const [localTask, setLocalTask] = useState<TaskState | null>(task ?? null);

  const activeTask = localTask?.id === task?.id ? localTask : task ?? localTask;
  // 引用最新 activeTask 供事件处理器在闭包内读取，避免 effect 重复订阅。
  const activeTaskRef = useRef(activeTask);
  activeTaskRef.current = activeTask;

  useEffect(() => {
    setLocalTask(task ?? null);
  }, [task?.id]);

  const resetForTask = useCallback(() => {
    setConversation([]);
    setConversationLoading(true);
    setStreamStatus("connecting");
    setStreamError(null);
    setToolActivity(null);
    setToolCalls([]);
    setApprovals([]);
  }, []);

  const handleStreamEvent = useCallback((event: TaskStreamEvent) => {
    const currentTask = activeTaskRef.current;
    if (event.type === "task_updated") {
      const data = event.data as Partial<TaskState> | undefined;
      if (data && typeof data === "object" && currentTask) {
        setLocalTask((current) => ({ ...(current?.id === currentTask.id ? current : currentTask), ...data }) as TaskState);
      }
      return;
    }

    const delta = getTextDelta(event);
    if (delta) {
      setStreamStatus("streaming");
      setConversation((current) => {
        const streaming = current.find((item) => item.id === STREAMING_MESSAGE_ID);
        if (streaming) {
          return current.map((item) => item.id === STREAMING_MESSAGE_ID ? { ...item, text: item.text + delta } : item);
        }
        return [...current, { id: STREAMING_MESSAGE_ID, role: "assistant", text: delta, streaming: true }];
      });
    }

    const thinkingDelta = getThinkingDelta(event);
    if (thinkingDelta) {
      setStreamStatus("streaming");
      setConversation((current) => {
        const streaming = current.find((item) => item.id === STREAMING_MESSAGE_ID);
        if (streaming) {
          return current.map((item) => item.id === STREAMING_MESSAGE_ID
            ? { ...item, thinking: `${item.thinking ?? ""}${thinkingDelta}` }
            : item);
        }
        return [...current, {
          id: STREAMING_MESSAGE_ID,
          role: "assistant",
          text: "",
          thinking: thinkingDelta,
          streaming: true,
        }];
      });
    }

    if (event.type === "tool_started") {
      const data = event.data as { name?: string; callId?: string; args?: unknown; startedAt?: string } | undefined;
      const callId = typeof data?.callId === "string" ? data.callId : `tool-${Date.now()}`;
      setStreamStatus("streaming");
      setToolActivity(`正在运行 ${typeof data?.name === "string" ? data.name : "工具"}`);
      setToolCalls((current) => [
        ...current.filter((call) => call.callId !== callId),
        { callId, name: data?.name ?? "工具", args: data?.args, startedAt: data?.startedAt },
      ]);
    }
    if (event.type === "tool_updated") {
      const data = event.data as { callId?: string; name?: string; partialResult?: unknown } | undefined;
      const callId = typeof data?.callId === "string" ? data.callId : "";
      if (callId) {
        setToolCalls((current) => current.map((call) =>
          call.callId === callId ? { ...call, name: data?.name ?? call.name, args: data?.partialResult ?? call.args } : call,
        ));
      }
    }
    if (event.type === "tool_finished") {
      const data = event.data as { callId?: string; name?: string; result?: unknown; isError?: boolean } | undefined;
      const callId = typeof data?.callId === "string" ? data.callId : "";
      setToolActivity(null);
      if (callId) {
        setToolCalls((current) => current.map((call) =>
          call.callId === callId
            ? { ...call, name: data?.name ?? call.name, result: data?.result, isError: Boolean(data?.isError), finishedAt: new Date().toISOString() }
            : call,
        ));
      }
    }
    if (event.type === "run_failed") {
      setStreamStatus("error");
      const data = event.data as { action?: string } | undefined;
      setStreamError(data?.action ?? "Agent 执行失败");
      setToolActivity(null);
    }
    if (event.type === "run_settled" || event.type === "message_completed") {
      setStreamStatus("idle");
      setToolActivity(null);
      const eventIdentity = typeof event.id === "string" && event.id
        ? event.id
        : typeof event.seq === "number" ? String(event.seq) : crypto.randomUUID();
      setConversation((current) => current.map((item) => (
        item.id === STREAMING_MESSAGE_ID ? { ...item, id: `assistant-${eventIdentity}`, streaming: false } : item
      )));
    }
    if (event.type === "approval_requested") {
      const data = event.data as ApprovalInfo & { requestId?: string } | undefined;
      const requestId = data?.requestId;
      if (requestId) {
        setApprovals((current) => [...current.filter((a) => a.requestId !== requestId), {
          requestId,
          kind: data.kind ?? "confirm",
          title: data.title ?? "审批",
          message: data.message ?? "",
          safeLabel: data.safeLabel,
          impact: data.impact,
          options: data.options,
          status: "pending",
        }]);
      }
    }
    if (event.type === "approval_resolved") {
      const data = event.data as { requestId?: string } | undefined;
      const requestId = data?.requestId;
      if (requestId) {
        setApprovals((current) => current.filter((a) => a.requestId !== requestId));
      }
    }
  }, []);

  useEffect(() => {
    resetForTask();
    const controller = new AbortController();

    if (isLegacy) {
      void loadSessionConversation(sessionId, controller.signal)
        .then((messages) => {
          const loaded = messages.map(normalizeConversationMessage).filter((item): item is ConversationItem => item !== null);
          setConversation((current) => mergeConversation(current, loaded));
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setStreamError(error instanceof Error ? error.message : "会话记录暂时无法读取");
          setStreamStatus("error");
        })
        .finally(() => setConversationLoading(false));
      return () => controller.abort();
    }

    if (!activeTask) return () => controller.abort();
    const taskId = activeTask.id;

    const unsubscribe = subscribeTaskEvents(taskId, handleStreamEvent, (connected) => {
      if (!connected) setStreamStatus("connecting");
    });

    void loadTaskConversation(taskId, controller.signal)
      .then((messages) => {
        const loaded = messages.map(normalizeConversationMessage).filter((item): item is ConversationItem => item !== null);
        setConversation((current) => mergeConversation(current, loaded));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStreamError(error instanceof Error ? error.message : "会话记录暂时无法读取");
        setStreamStatus("error");
      })
      .finally(() => setConversationLoading(false));

    void loadTaskInterventions(taskId, controller.signal)
      .then((items) => {
        const raw = items as Array<Record<string, unknown>>;
        const pending = raw
          .filter((item) => item.status === "pending")
          .map((item) => ({
            requestId: item.id as string,
            kind: (item.kind as ApprovalKind) ?? "confirm",
            title: (item.title as string) ?? "审批",
            message: (item.message as string) ?? "",
            safeLabel: item.safeLabel as string | undefined,
            impact: item.impact as string | undefined,
            options: item.options as string[] | undefined,
            status: "pending" as const,
          }));
        if (pending.length > 0) setApprovals(pending);
      })
      .catch(() => { /* 忽略：审批会在 SSE 事件中到达 */ });

    return () => {
      controller.abort();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isLegacy, handleStreamEvent, resetForTask]);

  // localTask 变化时上报父级；用微任务避开渲染期间 setState 父组件的问题。
  const prevTaskRef = useRef<TaskState | null | undefined>(task);
  prevTaskRef.current = task;
  useEffect(() => {
    if (!localTask) return;
    const prevFromProps = prevTaskRef.current;
    if (prevFromProps && prevFromProps.id === localTask.id && prevFromProps.status === localTask.status) {
      return;
    }
    queueMicrotask(() => onTaskUpdated(localTask));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTask]);

  return {
    activeTask,
    setLocalTask,
    conversation,
    conversationLoading,
    streamStatus,
    streamError,
    toolActivity,
    toolCalls,
    approvals,
    setMessageStatus: (id: string, status: NonNullable<ConversationItem["status"]>) => {
      setConversation((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    },
    removeApproval: (requestId: string) => {
      setApprovals((current) => current.filter((a) => a.requestId !== requestId));
    },
    beginOptimisticSend: (text: string) => {
      const id = `user-${Date.now()}`;
      setConversation((current) => [...current, { id, role: "user", text, status: "sending" }]);
      return id;
    },
  };
}
