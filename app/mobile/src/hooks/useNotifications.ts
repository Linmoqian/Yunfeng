// 任务通知：监听任务状态变化，在页面隐藏时发出本地通知。
// 首次快照只建基线不通知，避免启动时把历史任务全部提醒一遍。

import { useEffect, useRef } from "react";
import type { TaskState, TaskStatus } from "@/lib/types";
import { notify, taskTransitionNotice } from "@/lib/notifications";

/** 监听任务列表状态变化；enabled 由设置页控制。 */
export function useTaskNotifications(tasks: TaskState[], enabled: boolean) {
  const knownStatusRef = useRef<Map<string, TaskStatus> | null>(null);

  useEffect(() => {
    // 首次拿到非空列表时只建基线，避免把历史任务全部提醒一遍。
    if (knownStatusRef.current === null) {
      if (tasks.length === 0) return;
      knownStatusRef.current = new Map(tasks.map((task) => [task.id, task.status]));
      return;
    }
    const previous = knownStatusRef.current;
    const next = new Map(tasks.map((task) => [task.id, task.status]));
    knownStatusRef.current = next;
    if (!enabled || document.visibilityState !== "hidden") return;

    for (const [id, status] of next) {
      const before = previous.get(id);
      if (before === undefined || before === status) continue;
      const task = tasks.find((item) => item.id === id);
      if (task === undefined) continue;
      const notice = taskTransitionNotice(task);
      if (notice !== null) void notify(notice.title, notice.body);
    }
  }, [tasks, enabled]);
}

/** 审批出现时立即通知（页面隐藏时）。 */
export function useApprovalNotifications(
  approvalCount: number,
  approvalTitle: string | null,
  enabled: boolean,
) {
  const prevCountRef = useRef(approvalCount);

  useEffect(() => {
    const previous = prevCountRef.current;
    prevCountRef.current = approvalCount;
    if (!enabled || document.visibilityState !== "hidden") return;
    if (approvalCount > previous && approvalTitle !== null) {
      void notify("任务需要审批", approvalTitle);
    }
  }, [approvalCount, approvalTitle, enabled]);
}
