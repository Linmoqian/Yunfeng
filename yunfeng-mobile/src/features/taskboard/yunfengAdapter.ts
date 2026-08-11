// Yunfeng 后端适配层：将 Yunfeng 的 TaskState 映射为 Dashi 看板数据模型。
// 后端不支持的功能（评论、附件、关系、标签、优先级等）返回空数据或 no-op。

import {
  loadTasks,
  sendTaskCommand,
  type TaskState,
} from "../../services/taskService";
import type {
  ActorIdentity,
  Attachment,
  Comment,
  DevelopmentScan,
  HostContext,
  Project,
  ProjectSummary,
  Task,
  TaskChangeActivity,
  TaskDraft,
  TaskPriority,
  TaskStatus,
  TaskboardMetadata,
  WorkflowCapabilities,
  WorkflowWorkspaceRecord,
} from "./types";

const GLOBAL_PROJECT_ID = "local";

const LOCAL_USER: ActorIdentity = {
  type: "user",
  id: "local-user",
  name: "本地用户",
  avatarUrl: null,
};

// ---- 状态映射 ----

const STATUS_MAP: Record<TaskState["status"], TaskStatus> = {
  running: "in_progress",
  waiting_approval: "in_review",
  waiting_input: "todo",
  failed: "todo",
  completed: "done",
  archived: "done",
};

function getProjectName(cwd: string): string {
  const parts = cwd.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || cwd;
}

function getProjectId(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

// ---- Task 转换 ----

function toDashiTask(task: TaskState, index: number): Task {
  const projectId = getProjectId(task.cwd);
  return {
    id: task.id,
    identifier: `#${index + 1}`,
    projectId,
    title: task.title || "未命名任务",
    description: task.currentAction || task.attentionReason || "",
    status: STATUS_MAP[task.status] ?? "todo",
    priority: "none" as TaskPriority,
    labels: [getProjectName(task.cwd)],
    sortOrder: index,
    threadId: task.sessionId,
    conversationRefs: [],
    participants: [],
    previewImage: null,
    activityKey: "",
    activityUpdatedAt: task.updatedAt,
    creatorType: "user",
    creatorId: "local-user",
    creatorName: "本地用户",
    creatorAvatarUrl: null,
    assignee: LOCAL_USER,
    workflowId: null,
    developmentContext: null,
    startDate: task.createdAt,
    dueDate: null,
    recurrence: null,
    archivedAt: task.archivedAt ?? null,
    relations: { parent: null, subIssues: [], blockedBy: [], blocks: [], related: [] },
    version: 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

// ---- Projects ----

async function listYunfengProjects(): Promise<Project[]> {
  const { tasks } = await loadTasks({ limit: 500 });
  const cwdSet = new Set<string>();
  for (const t of tasks) cwdSet.add(t.cwd);

  const projects: Project[] = [{
    id: GLOBAL_PROJECT_ID,
    name: "全部项目",
    workspacePath: null,
    issueCount: tasks.length,
    createdAt: tasks[0]?.createdAt ?? "",
    updatedAt: tasks[0]?.updatedAt ?? "",
  }];
  for (const cwd of cwdSet) {
    const inProject = tasks.filter((t) => t.cwd === cwd);
    projects.push({
      id: getProjectId(cwd),
      name: getProjectName(cwd),
      workspacePath: cwd,
      issueCount: inProject.length,
      createdAt: inProject[0]?.createdAt ?? "",
      updatedAt: inProject.map((t) => t.updatedAt).sort().reverse()[0] ?? "",
    });
  }
  return projects;
}

// ---- 导出适配 API ----

export async function adapterListProjects(_signal?: AbortSignal): Promise<Project[]> {
  return listYunfengProjects();
}

export async function adapterListTasks(projectId: string, _signal?: AbortSignal): Promise<Task[]> {
  const { tasks } = await loadTasks({ limit: 500 });
  const filtered = projectId === GLOBAL_PROJECT_ID
    ? tasks.filter((t) => t.status !== "archived")
    : tasks.filter((t) => getProjectId(t.cwd) === projectId && t.status !== "archived");
  return filtered.map((t, i) => toDashiTask(t, i));
}

export async function adapterGetTaskboardMetadata(_signal?: AbortSignal): Promise<TaskboardMetadata> {
  return {
    mode: "local",
    realtime: { transport: "poll", intervalMs: 3000 },
    localCapabilities: { available: true },
  };
}

export async function adapterGetTaskboardRevision(
  _since: number,
  _signal?: AbortSignal,
): Promise<{ changed: boolean; revision: number }> {
  return { changed: false, revision: Date.now() };
}

export async function adapterGetHostRuntime(_signal?: AbortSignal): Promise<HostContext | null> {
  return null;
}

export async function adapterPublishHostRuntime(_ctx: HostContext): Promise<void> {}

export async function adapterGetCodexThreadProgress(
  _ids: string[],
  _signal?: AbortSignal,
): Promise<Record<string, { completed: number | null; total: number | null; running: boolean } | null>> {
  return {};
}

export async function adapterListDeviceWorkspaces(_signal?: AbortSignal): Promise<Record<string, string>> {
  return {};
}

export async function adapterListWorkflowCapabilities(
  _workspacePath?: string,
  _signal?: AbortSignal,
): Promise<WorkflowCapabilities> {
  return { skills: [], mcpServers: [] };
}

export async function adapterGetWorkflowWorkspace<T>(
  projectId: string,
  _signal?: AbortSignal,
): Promise<WorkflowWorkspaceRecord<T>> {
  return { projectId, workspace: null as T, version: 0, updatedAt: null };
}

export async function adapterListDevelopmentContexts(
  _projectId: string,
  _codexProjectId?: string,
  _codexThreadId?: string,
  _signal?: AbortSignal,
  _workspacePath?: string,
): Promise<DevelopmentScan> {
  return { workspacePath: null, contexts: [] };
}

export async function adapterGetProjectSummary(
  projectId: string,
  _signal?: AbortSignal,
): Promise<ProjectSummary> {
  return { projectId, summary: null, updatedAt: null, refreshing: false, error: null };
}

export async function adapterListComments(_taskId: string, _signal?: AbortSignal): Promise<Comment[]> {
  return [];
}

export async function adapterListAttachments(_taskId: string, _signal?: AbortSignal): Promise<Attachment[]> {
  return [];
}

export async function adapterListTaskActivities(
  _taskId: string,
  _signal?: AbortSignal,
): Promise<TaskChangeActivity[]> {
  return [];
}

export async function adapterCreateTask(
  projectId: string,
  draft: TaskDraft,
  _threadId?: string,
): Promise<Task> {
  const projects = await listYunfengProjects();
  const project = projects.find((p) => p.id === projectId);
  const cwd = project?.workspacePath ?? "/";
  const { createTask } = await import("../../services/taskService");
  const { task } = await createTask(cwd, draft.title);
  return toDashiTask(task, 0);
}

export async function adapterUpdateTask(
  task: Task,
  draft: TaskDraft,
  _threadId?: string,
): Promise<Task> {
  if (draft.title && draft.title !== task.title) {
    const { renameTask } = await import("../../services/taskService");
    const updated = await renameTask(task.id, draft.title);
    return toDashiTask(updated, 0);
  }
  return task;
}

export async function adapterMoveTask(
  task: Task,
  status: TaskStatus,
  _sortOrder?: number,
  _threadId?: string,
): Promise<Task> {
  if (status === "done" && task.status !== "done") {
    await sendTaskCommand(task.id, { type: "complete" });
  }
  return { ...task, status };
}

export async function adapterArchiveTask(task: Task, _threadId?: string): Promise<Task> {
  await sendTaskCommand(task.id, { type: "archive" });
  return { ...task, archivedAt: new Date().toISOString() };
}

export async function adapterRestoreTask(task: Task, _threadId?: string): Promise<Task> {
  await sendTaskCommand(task.id, { type: "reopen" });
  return { ...task, archivedAt: null };
}
