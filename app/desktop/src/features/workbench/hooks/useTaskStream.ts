// 任务聚焦面板的事件流 Hook：聚合会话输出、工具调用、审批与任务状态变更。
// 按服务端消息身份合并快照和增量；Server TaskStore 是任务事实来源。
// Created on 2026-10-19
// @author: https://github.com/Linmoqian

import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadTask,
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
  STREAMING_MESSAGE_ID,
  type ApprovalInfo,
  type ConversationItem,
  type ToolCallInfo,
} from "../components/ConversationLog";

import { normalizeConversationMessage, normalizeConversationMessages } from "../conversationMessages";
import { reduceToolFeedback, settleToolFeedback } from "../toolFeedback";

export type StreamStatus = "connecting" | "idle" | "streaming" | "error";
export type ApprovalKind = "confirm" | "select" | "input";

export interface StreamHandlerOptions {
  task?: TaskState;
  legacySession?: SessionSnapshot;
  isDraft: boolean;
  isLegacy: boolean;
  initialMessage?: string;
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
  queueRevision: number;
  changesRevision: number;
  /** 更新某条消息的发送状态。 */
  setMessageStatus: (id: string, status: NonNullable<ConversationItem["status"]>) => void;
  /** 移除一条待审批。 */
  removeApproval: (requestId: string) => void;
  /** 追加乐观用户消息并返回其 id（发送流程封装）。 */
  beginOptimisticSend: (text: string) => string;
}

export function useTaskStream({ task, isDraft, isLegacy, initialMessage, sessionId, onTaskUpdated }: StreamHandlerOptions): StreamResult {
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [approvals, setApprovals] = useState<ApprovalInfo[]>([]);
  const [changesRevision, setChangesRevision] = useState(0);
  const [queueRevision, setQueueRevision] = useState(0);
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
    if (event.type === "git_changed") setChangesRevision((value) => value + 1);
    if (event.type === "queue_updated") setQueueRevision((value) => value + 1);
    const currentTask = activeTaskRef.current;
    if (event.type === "task_updated") {
      const data = event.data as Partial<TaskState> & { kind?: string } | undefined;
      // 服务端连接帧只携带补发元信息，不更新本地任务状态。
      if (data?.kind === "connected") return;
      if (data && typeof data === "object" && currentTask) {
        if (typeof data.lastEventSeq === "number" && data.lastEventSeq < currentTask.lastEventSeq) return;
        setLocalTask((current) => current?.id === currentTask.id && typeof data.lastEventSeq === "number" && current.lastEventSeq > data.lastEventSeq
          ? current : ({ ...(current?.id === currentTask.id ? current : currentTask), ...data }) as TaskState);
        if (!currentTask.autonomy && data.status === "running" && currentTask.status !== "running") setToolCalls((calls) => calls.filter((call) => !call.finishedAt));
        if (["completed", "failed", "archived"].includes(data.status ?? "") || ["PAUSED", "FAILED", "COMPLETED"].includes(data.autonomy?.phase ?? "")) {
          setToolCalls((calls) => settleToolFeedback(calls, event.occurredAt ?? "unknown"));
        }
      }
      return;
    }
    if (event.type === "message_completed" && (event.data as { message?: unknown } | undefined)?.message) {
      const next = normalizeConversationMessage((event.data as { message: unknown }).message, event.seq ?? 0);
      if (next) setConversation((current) => {
        if (current.some((item) => item.id === next.id)) return current;
        const optimistic = next.role === "user" ? current.find((item) => item.status && item.role === "user" && item.text === next.text) : undefined;
        return [...current.filter((item) => item.id !== optimistic?.id), next];
      });
      setStreamStatus("idle");
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

    if (["tool_started", "tool_updated", "tool_finished"].includes(event.type)) {
      setToolCalls((current) => reduceToolFeedback(current, event));
      if (event.type === "tool_started") setStreamStatus("streaming");
    }
    if (event.type === "run_failed" || event.type === "run_settled") {
      setToolCalls((current) => settleToolFeedback(current, event.occurredAt ?? "unknown"));
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

    if (isDraft) {
      setConversationLoading(false);
      setStreamStatus("idle");
      return () => controller.abort();
    }

    if (isLegacy) {
      void loadSessionConversation(sessionId, controller.signal)
        .then((messages) => {
          if (controller.signal.aborted) return;
          setStreamStatus("idle");
          setStreamError(null);
          const loaded = normalizeConversationMessages(messages);
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

    let reading = false;
    let refreshPending = false;
    const refreshConversation = async () => {
      if (controller.signal.aborted) return;
      if (reading) { refreshPending = true; return; }
      reading = true;
      try {
        const messages = await loadTaskConversation(taskId, controller.signal);
        if (controller.signal.aborted) return;
        const loaded = normalizeConversationMessages(messages);
        setConversation((current) => mergeConversation(current, loaded));
        setStreamError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStreamError(error instanceof Error ? error.message : "会话记录暂时无法读取");
        setStreamStatus("error");
      } finally {
        reading = false;
        if (!controller.signal.aborted) {
          setConversationLoading(false);
          if (refreshPending) { refreshPending = false; void refreshConversation(); }
        }
      }
    };
    const initialSeq = activeTask.lastEventSeq;
    const unsubscribe = subscribeTaskEvents(taskId, (event) => {
      if (event.seq !== undefined && event.seq <= initialSeq) {
        if (["tool_started", "tool_updated", "tool_finished"].includes(event.type)) setToolCalls((current) => {
          const calls = reduceToolFeedback(current, event), latest = activeTaskRef.current;
          return latest && (["completed", "failed", "archived"].includes(latest.status) || ["PAUSED", "FAILED", "COMPLETED"].includes(latest.autonomy?.phase ?? ""))
            ? settleToolFeedback(calls, latest.updatedAt) : calls;
        });
        return;
      }
      handleStreamEvent(event);
      if (event.type === "run_settled") void refreshConversation();
    }, (connected) => {
      if (!connected) setStreamStatus("connecting");
      else {
        setStreamStatus((status) => status === "streaming" ? status : "idle");
        void refreshConversation();
        void loadTask(taskId, controller.signal).then((snapshot) => {
          if (controller.signal.aborted) return;
          if (activeTaskRef.current && activeTaskRef.current.lastEventSeq > snapshot.lastEventSeq) return;
          setLocalTask((current) => current && current.lastEventSeq > snapshot.lastEventSeq ? current : snapshot);
          if (["completed", "failed", "archived"].includes(snapshot.status) || ["PAUSED", "FAILED", "COMPLETED"].includes(snapshot.autonomy?.phase ?? "")) {
            setToolCalls((calls) => settleToolFeedback(calls, snapshot.updatedAt));
          }
        }).catch(() => { /* 连接恢复后仍由实时快照继续收敛。 */ });
      }
    }, Math.max(0, initialSeq - 120));
    void refreshConversation();

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
  }, [sessionId, isDraft, isLegacy, handleStreamEvent, resetForTask]);

  useEffect(() => {
    if (!initialMessage || !task) return;
    setConversation((current) => {
      const exists = current.some((item) => item.role === "user" && item.text === initialMessage);
      return exists ? current : [...current, {
        id: `initial-user-${task.id}`,
        role: "user",
        text: initialMessage,
        status: "sent",
      }];
    });
  }, [initialMessage, task]);

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
    queueRevision,
    changesRevision,
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
