// 任务状态展示：列表与看板共用的标签、列顺序与分组。

import type { TaskState, TaskStatus } from "./types";

export function statusLabel(task: TaskState): string {
  switch (task.status) {
    case "running":
      return task.currentAction || "运行中";
    case "waiting_approval":
      return "待审批";
    case "waiting_input":
      return "待输入";
    case "failed":
      return "失败";
    case "completed":
      return "已完成";
    case "archived":
      return "已归档";
    default:
      return task.status;
  }
}

export interface BoardColumn {
  status: TaskStatus;
  label: string;
  /** 列头状态点颜色 token 变量名。 */
  dotVar: string;
}

/** 看板列顺序；归档任务不在看板展示。 */
export const BOARD_COLUMNS: BoardColumn[] = [
  { status: "running", label: "运行中", dotVar: "var(--yf-brand-primary)" },
  { status: "waiting_approval", label: "待审批", dotVar: "var(--yf-semantic-warning)" },
  { status: "waiting_input", label: "待输入", dotVar: "var(--yf-semantic-info)" },
  { status: "failed", label: "失败", dotVar: "var(--yf-semantic-error)" },
  { status: "completed", label: "已完成", dotVar: "var(--yf-semantic-success)" },
];

/** 按看板列分组；只保留 BOARD_COLUMNS 内的状态。 */
export function groupTasksByStatus(tasks: TaskState[]): Map<TaskStatus, TaskState[]> {
  const groups = new Map<TaskStatus, TaskState[]>(
    BOARD_COLUMNS.map((column) => [column.status, []]),
  );
  for (const task of tasks) {
    groups.get(task.status)?.push(task);
  }
  return groups;
}
