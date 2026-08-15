// 任务列表：只读 + 新建。任务数据源是电脑侧网关，移动端不维护本地事实副本。

import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayClient } from "../lib/gateway";
import type { TaskState } from "../lib/types";

export interface UseTasksResult {
  tasks: TaskState[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (message?: string) => Promise<TaskState | null>;
}

export function useTasks(client: GatewayClient | null): UseTasksResult {
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (!client || refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await client.loadTasks({ archived: "false", limit: 100 });
      setTasks(data.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 任务状态变化时刷新列表；消息增量不触发，避免高频请求。
  useEffect(() => {
    if (!client) return;
    return client.subscribeTaskSummary((event) => {
      if (
        event.type === "task_snapshot" ||
        event.type === "task_updated" ||
        event.type === "run_settled" ||
        event.type === "run_failed"
      ) {
        void refresh();
      }
    });
  }, [client, refresh]);

  const createTask = useCallback(
    async (message = "") => {
      if (!client) return null;
      setError(null);
      try {
        const data = await client.createTask(message);
        await refresh();
        return data.task;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [client, refresh],
  );

  return { tasks, loading, error, refresh, createTask };
}
