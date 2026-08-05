export type TaskSection = "attention" | "running" | "waiting" | "completed";

export interface TaskSummary {
  id: string;
  title: string;
  projectName: string;
  section: TaskSection;
  statusLabel: string;
  currentAction: string;
  attentionReason?: string;
  primaryAction?: {
    label: string;
    kind: "approve" | "answer" | "choose" | "retry" | "open";
  };
  updatedAt: string;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  firstMessage: string;
  cwd: string | undefined;
  modified: string;
  messageCount: number;
  attentionReason?: string;
}

export interface TaskSectionGroup {
  id: TaskSection;
  label: string;
  tasks: TaskSummary[];
}

const SECTION_ORDER: Array<{ id: TaskSection; label: string }> = [
  { id: "attention", label: "需要你介入" },
  { id: "running", label: "正在进行" },
  { id: "waiting", label: "等待中" },
  { id: "completed", label: "已完成" },
];

export function buildTaskSections(tasks: TaskSummary[]): TaskSectionGroup[] {
  const taskGroups = new Map<TaskSection, TaskSummary[]>();

  for (const task of tasks) {
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

export function createTaskSummaries(
  sessions: SessionSnapshot[],
  runningSessionIds: string[],
): TaskSummary[] {
  const runningIds = new Set(runningSessionIds);

  return sessions.map((session) => {
    const title = session.name.trim() || session.firstMessage.trim() || "未命名任务";
    const projectName = getProjectName(session.cwd);
    const running = runningIds.has(session.id);

    if (session.attentionReason) {
      return {
        id: session.id,
        title,
        projectName,
        section: "attention",
        statusLabel: "需要介入",
        currentAction: "等待你的决定",
        attentionReason: session.attentionReason,
        primaryAction: { label: "查看任务", kind: "open" },
        updatedAt: session.modified,
      } satisfies TaskSummary;
    }

    if (running) {
      return {
        id: session.id,
        title,
        projectName,
        section: "running",
        statusLabel: "正在进行",
        currentAction: "Agent 正在工作",
        primaryAction: { label: "查看任务", kind: "open" },
        updatedAt: session.modified,
      } satisfies TaskSummary;
    }

    return {
      id: session.id,
      title,
      projectName,
      section: "completed",
      statusLabel: "已完成",
      currentAction: "已保存会话",
      primaryAction: { label: "查看任务", kind: "open" },
      updatedAt: session.modified,
    } satisfies TaskSummary;
  });
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

function getProjectName(cwd: string | undefined): string {
  if (!cwd) return "未指定项目";
  const normalizedPath = cwd.replace(/[\\/]+$/, "");
  const pathParts = normalizedPath.split(/[\\/]/);
  return pathParts[pathParts.length - 1] || "未指定项目";
}
