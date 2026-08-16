// 单任务视图：对话加载、发送指令与事件流订阅。
// 流式增量来自网关 SSE，历史消息来自 /api/tasks/:id/conversation。
// 事件到状态的归约逻辑在 lib/taskEvents.ts，本 hook 只编排。

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { GatewayClient } from "../lib/gateway";
import { approvalFromIntervention, type ApprovalCard } from "../lib/approvals";
import {
  initialTaskView,
  taskViewReducer,
  type TaskViewState,
} from "../lib/taskEvents";
import type { TaskState } from "../lib/types";

export interface UseTaskResult extends TaskViewState {
  openTask: (task: TaskState) => Promise<void>;
  closeTask: () => void;
  sendPrompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  retry: () => Promise<void>;
  reconnect: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  resolveApproval: (requestId: string, decision: "approve" | "reject", value?: string) => Promise<void>;
  refreshConversation: () => Promise<void>;
}

export function useTask(client: GatewayClient | null): UseTaskResult {
  const [state, dispatch] = useReducer(taskViewReducer, undefined, initialTaskView);

  const clientRef = useRef(client);
  clientRef.current = client;
  const taskRef = useRef<TaskState | null>(state.task);
  taskRef.current = state.task;
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const refreshConversation = useCallback(async () => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current) return;
    try {
      dispatch({ type: "conversation", messages: await c.loadTaskConversation(current.id) });
    } catch (e) {
      dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  /** 建立任务事件流；重连时由服务端按 Last-Event-ID 补发，再拉一次对话兜底。 */
  const subscribeStream = useCallback(
    (c: GatewayClient, taskId: string) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = c.subscribeTaskEvents(
        taskId,
        (event) => dispatch({ type: "stream-event", event }),
        (connected) => {
          dispatch({ type: "stream-connected", connected });
          if (connected) void refreshConversation();
        },
      );
    },
    [refreshConversation],
  );

  const openTask = useCallback(
    async (next: TaskState) => {
      const c = clientRef.current;
      if (!c) {
        dispatch({ type: "error", message: "网关未配置" });
        return;
      }
      taskRef.current = next;
      dispatch({ type: "open", task: next });
      try {
        const [conversation, interventions] = await Promise.all([
          c.loadTaskConversation(next.id),
          c.loadTaskInterventions(next.id),
        ]);
        dispatch({ type: "conversation", messages: conversation });
        dispatch({
          type: "interventions",
          approvals: interventions
            .filter((item) => item.status === "pending")
            .map((item) => approvalFromIntervention(item))
            .filter((item): item is ApprovalCard => item !== null),
        });
      } catch (e) {
        dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
      subscribeStream(c, next.id);
    },
    [subscribeStream],
  );

  const closeTask = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    dispatch({ type: "close" });
  }, []);

  const sendPrompt = useCallback(async (text: string) => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current || text.trim() === "") return;
    dispatch({
      type: "user-message",
      message: {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      },
    });
    try {
      await c.sendTaskCommand(current.id, { type: "prompt", message: text });
    } catch (e) {
      dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const abort = useCallback(async () => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current) return;
    try {
      await c.sendTaskCommand(current.id, { type: "abort" });
      dispatch({ type: "abort" });
    } catch (e) {
      dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const retry = useCallback(async () => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (c === null || current === null) return;
    dispatch({ type: "retry-start" });
    try {
      await c.sendTaskCommand(current.id, { type: "retry" });
    } catch (e) {
      dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  /** 断线后重连：重建事件流并刷新对话，不丢失当前任务。 */
  const reconnect = useCallback(async () => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current) return;
    dispatch({ type: "retry-start" });
    subscribeStream(c, current.id);
    await refreshConversation();
  }, [subscribeStream, refreshConversation]);

  const resolveApproval = useCallback(
    async (requestId: string, decision: "approve" | "reject", value?: string) => {
      const c = clientRef.current;
      const current = taskRef.current;
      if (c === null || current === null) return;
      dispatch({ type: "resolve-approval", requestId });
      try {
        await c.resolveIntervention(current.id, requestId, decision, value);
      } catch (e) {
        dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
        void openTask(current);
      }
    },
    [openTask],
  );

  const setModel = useCallback(async (provider: string, modelId: string) => {
    const c = clientRef.current;
    const current = taskRef.current;
    if (!c || !current) return;
    try {
      await c.sendTaskCommand(current.id, { type: "setModel", provider, modelId });
      dispatch({ type: "set-model", provider, modelId });
    } catch (e) {
      dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  return {
    ...state,
    openTask,
    closeTask,
    sendPrompt,
    abort,
    retry,
    reconnect,
    setModel,
    resolveApproval,
    refreshConversation,
  };
}
