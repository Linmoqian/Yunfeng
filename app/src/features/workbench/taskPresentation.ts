// 任务展示层：把真实 TaskState 映射为工作台分组。
// 阶段 1：状态由后端领域状态提供，前端不再根据 session 是否运行推断“完成”。

import type { SessionSnapshot, TaskState } from "../../services/taskService";

export type TaskSection =
  | "attention"
  | "running"
  | "waiting_approval"
  | "waiting"
  | "completed"
  | "archived"
  | "legacy";

export interface TaskSummary {
  id: string;
  sessionId: string;
  title: string;
  projectName: string;
  section: TaskSection;
  statusLabel: string;
  currentAction: string;
  attentionReason?: string;
  updatedAt: string;
  isLegacy: boolean;
  status: TaskState["status"] | "history";
  phase: TaskState["phase"];
  cwd: string;
}

export interface TaskSectionGroup {
  id: TaskSection;
  label: string;
  tasks: TaskSummary[];
}

const SECTION_ORDER: Array<{ id: TaskSection; label: string }> = [
  { id: "attention", label: "需要你介入" },
  { id: "running", label: "正在进行" },
  { id: "waiting_approval", label: "等待审批" },
  { id: "waiting", label: "等待继续" },
  { id: "completed", label: "已完成" },
  { id: "archived", label: "已归档" },
  { id: "legacy", label: "旧会话" },
];

export const STATUS_LABELS: Record<TaskState["status"] | "history", string> = {
  running: "正在进行",
  waiting_input: "等待继续",
  waiting_approval: "等待审批",
  failed: "需要处理",
  completed: "已完成",
  archived: "已归档",
  history: "已保存会话",
};

export function sectionForTask(task: TaskState | { status: TaskState["status"] | "history" }): TaskSection {
  switch (task.status) {
    case "failed": return "attention";
    case "waiting_approval": return "waiting_approval";
    case "running": return "running";
    case "waiting_input": return "waiting";
    case "completed": return "completed";
    case "archived": return "archived";
    case "history": return "legacy";
    default: return "waiting";
  }
}

export function taskToSummary(task: TaskState): TaskSummary {
  const title = task.title.trim() || "未命名任务";
  const section = sectionForTask(task);
  const attention = task.status === "failed";
  return {
    id: task.id,
    sessionId: task.sessionId,
    title,
    projectName: getProjectName(task.cwd),
    section,
    statusLabel: STATUS_LABELS[task.status],
    currentAction: task.currentAction || defaultAction(task.status),
    ...(attention && task.attentionReason ? { attentionReason: task.attentionReason } : {}),
    updatedAt: task.updatedAt,
    isLegacy: task.source === "legacy",
    status: task.status,
    phase: task.phase,
    cwd: task.cwd,
  };
}

export function sessionToLegacySummary(session: SessionSnapshot): TaskSummary {
  const title = session.name.trim() || session.firstMessage.trim() || "未命名会话";
  return {
    id: session.id,
    sessionId: session.id,
    title,
    projectName: getProjectName(session.cwd),
    section: "legacy",
    statusLabel: "已保存会话",
    currentAction: "浏览旧会话，首次操作后接入任务",
    updatedAt: session.modified,
    isLegacy: true,
    status: "history",
    phase: "unknown",
    cwd: session.cwd ?? "",
  };
}

function defaultAction(status: TaskState["status"]): string {
  switch (status) {
    case "running": return "Agent 正在工作";
    case "waiting_input": return "等待你的下一条指令";
    case "waiting_approval": return "等待你的决定";
    case "failed": return "本轮运行失败";
    case "completed": return "任务已完成";
    case "archived": return "已归档任务";
    default: return "";
  }
}

export function buildTaskSections(tasks: TaskSummary[], archivedVisible = false): TaskSectionGroup[] {
  const taskGroups = new Map<TaskSection, TaskSummary[]>();
  for (const task of tasks) {
    if (task.section === "archived" && !archivedVisible) continue;
    const group = taskGroups.get(task.section) ?? [];
    group.push(task);
    taskGroups.set(task.section, group);
  }

  return SECTION_ORDER.flatMap(({ id, label }) => {
    const groupedTasks = taskGroups.get(id);
    if (!groupedTasks || groupedTasks.length === 0) return [];
    return [{
      id,
      label,
      tasks: [...groupedTasks].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      ),
    }];
  });
}

export function selectMostRecentActiveTask(tasks: TaskState[]): TaskState | null {
  const activeTasks = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "archived",
  );
  activeTasks.sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
  return activeTasks[0] ?? null;
}

export function getProjectName(cwd: string | undefined): string {
  if (!cwd) return "未指定项目";
  const normalizedPath = cwd.replace(/[\\/]+$/, "");
  const pathParts = normalizedPath.split(/[\\/]/);
  return pathParts[pathParts.length - 1] || "未指定项目";
}

export function formatRelativeTime(timestamp: string, now = new Date().toISOString()): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.parse(now) - Date.parse(timestamp)) / 1000));
  if (!Number.isFinite(elapsedSeconds)) return "更新时间未知";
  if (elapsedSeconds < 60) return "刚刚";

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  if (hours < 48) return "昨天";

  return `${Math.floor(hours / 24)} 天前`;
}

/** 收集所有任务涉及的项目名，用于项目筛选下拉。 */
export function collectProjects(tasks: TaskSummary[]): string[] {
  const projects = new Set<string>();
  for (const task of tasks) {
    if (task.projectName && task.projectName !== "未指定项目") projects.add(task.projectName);
  }
  return [...projects].sort((a, b) => a.localeCompare(b));
}
