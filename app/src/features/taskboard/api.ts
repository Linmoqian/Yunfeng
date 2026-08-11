// Yunfeng 后端适配层：将 Yunfeng 的 TaskState 映射为 Dashi 看板数据模型。
// 已对接 Yunfeng 后端的 API 委托给 yunfengAdapter；
// 后端不支持的能力（评论、附件、关系、标签、AI 聊天等）保留签名但返回空数据或抛出。

import type {
  ActorIdentity,
  AiChatCatalog,
  AiChatAttachmentInput,
  AiChatRun,
  AiChatSandbox,
  AiChatThread,
  AiChatThreadSnapshot,
  Attachment,
  Comment,
  DevelopmentScan,
  HostContext,
  IssueRelationType,
  Project,
  ProjectSummary,
  Task,
  TaskChangeActivity,
  TaskboardMetadata,
  TaskDraft,
  TaskStatus,
  WorkflowCapabilities,
  WorkflowWorkspaceRecord,
} from "./types";

import {
  adapterArchiveTask,
  adapterCreateTask,
  adapterGetCodexThreadProgress,
  adapterGetHostRuntime,
  adapterGetProjectSummary,
  adapterGetTaskboardMetadata,
  adapterGetTaskboardRevision,
  adapterGetWorkflowWorkspace,
  adapterListAttachments,
  adapterListComments,
  adapterListDevelopmentContexts,
  adapterListDeviceWorkspaces,
  adapterListProjects,
  adapterListTaskActivities,
  adapterListTasks,
  adapterListWorkflowCapabilities,
  adapterMoveTask,
  adapterPublishHostRuntime,
  adapterRestoreTask,
  adapterUpdateTask,
} from "./yunfengAdapter";




export function setCurrentUserActor(_actor?: ActorIdentity) {
  
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message ?? `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error?.code ?? "REQUEST_FAILED";
    this.details = body.error?.details;
  }
}

// ---- 已对接 Yunfeng 后端 ----

export function listProjects(signal?: AbortSignal): Promise<Project[]> {
  return adapterListProjects(signal);
}

export function getProjectSummary(projectId: string, signal?: AbortSignal): Promise<ProjectSummary> {
  return adapterGetProjectSummary(projectId, signal);
}

export function getTaskboardMetadata(signal?: AbortSignal): Promise<TaskboardMetadata> {
  return adapterGetTaskboardMetadata(signal);
}

export function getTaskboardRevision(
  since: number,
  signal?: AbortSignal,
): Promise<{ changed: boolean; revision: number }> {
  return adapterGetTaskboardRevision(since, signal);
}

export function getHostRuntime(signal?: AbortSignal): Promise<HostContext | null> {
  return adapterGetHostRuntime(signal);
}

export function getCodexThreadProgress(
  threadIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, { completed: number | null; total: number | null; running: boolean } | null>> {
  return adapterGetCodexThreadProgress(threadIds, signal);
}

export function publishHostRuntime(context: HostContext): Promise<void> {
  return adapterPublishHostRuntime(context);
}

export function listDeviceWorkspaces(signal?: AbortSignal): Promise<Record<string, string>> {
  return adapterListDeviceWorkspaces(signal);
}

export function listWorkflowCapabilities(
  workspacePath?: string,
  signal?: AbortSignal,
): Promise<WorkflowCapabilities> {
  return adapterListWorkflowCapabilities(workspacePath, signal);
}

export function getWorkflowWorkspace<T>(
  projectId: string,
  signal?: AbortSignal,
): Promise<WorkflowWorkspaceRecord<T>> {
  return adapterGetWorkflowWorkspace<T>(projectId, signal);
}

export function listDevelopmentContexts(
  projectId: string,
  codexProjectId?: string,
  codexThreadId?: string,
  signal?: AbortSignal,
  workspacePath?: string,
): Promise<DevelopmentScan> {
  return adapterListDevelopmentContexts(projectId, codexProjectId, codexThreadId, signal, workspacePath);
}

export function listTasks(projectId: string, signal?: AbortSignal): Promise<Task[]> {
  return adapterListTasks(projectId, signal);
}

export function listComments(taskId: string, signal?: AbortSignal): Promise<Comment[]> {
  return adapterListComments(taskId, signal);
}

export function listAttachments(taskId: string, signal?: AbortSignal): Promise<Attachment[]> {
  return adapterListAttachments(taskId, signal);
}

export function listTaskActivities(
  taskId: string,
  signal?: AbortSignal,
): Promise<TaskChangeActivity[]> {
  return adapterListTaskActivities(taskId, signal);
}

export function createTask(projectId: string, draft: TaskDraft, threadId?: string): Promise<Task> {
  return adapterCreateTask(projectId, draft, threadId);
}

export function updateTask(task: Task, draft: TaskDraft, threadId?: string): Promise<Task> {
  return adapterUpdateTask(task, draft, threadId);
}

export function moveTask(
  task: Task,
  status: TaskStatus,
  sortOrder: number,
  threadId?: string,
): Promise<Task> {
  return adapterMoveTask(task, status, sortOrder, threadId);
}

export function archiveTask(task: Task, threadId?: string): Promise<Task> {
  return adapterArchiveTask(task, threadId);
}

export function restoreTask(task: Task, threadId?: string): Promise<Task> {
  return adapterRestoreTask(task, threadId);
}

// ---- 后端不支持的能力，保留签名返回空数据或抛出 ----

export async function createProject(input: {
  id: string;
  name: string;
  workspacePath: string | null;
}): Promise<Project> {
  return { ...input, issueCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

export async function deleteProject(_projectId: string): Promise<void> {}

export async function getAiChatCatalog(
  _projectId: string,
  _signal?: AbortSignal,
): Promise<AiChatCatalog> {
  return { models: [], skills: [], sandboxes: [] };
}

export async function listAiChatThreads(_signal?: AbortSignal): Promise<AiChatThread[]> {
  return [];
}

export async function createAiChatThread(_input: {
  projectId: string;
  issueId?: string;
  title?: string;
  model?: string;
  reasoningEffort?: string;
  sandbox?: AiChatSandbox;
}): Promise<AiChatThread> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "AI 聊天尚未对接" } });
}

export async function getAiChatThread(
  _threadId: string,
  _signal?: AbortSignal,
): Promise<AiChatThreadSnapshot> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "AI 聊天尚未对接" } });
}

export async function updateAiChatThread(
  _threadId: string,
  _input: {
    title?: string;
    model?: string;
    reasoningEffort?: string;
    sandbox?: AiChatSandbox;
  },
): Promise<AiChatThread> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "AI 聊天尚未对接" } });
}

export async function deleteAiChatThread(_threadId: string): Promise<void> {}

export async function startAiChatTurn(
  _threadId: string,
  _input: {
    message: string;
    skillIds?: string[];
    attachments?: AiChatAttachmentInput[];
    dangerFullAccessConfirmed?: boolean;
  },
): Promise<AiChatRun> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "AI 聊天尚未对接" } });
}

export async function interruptAiChatRun(_runId: string): Promise<AiChatRun> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "AI 聊天尚未对接" } });
}

export function subscribeAiChatThread(
  _threadId: string,
  _onHint: (type: "ai.event" | "ai.run") => void,
  _onError?: () => void,
): () => void {
  return () => {};
}

export async function saveWorkflowWorkspace<T>(
  _projectId: string,
  workspace: T,
  _version: number,
): Promise<WorkflowWorkspaceRecord<T>> {
  return { projectId: _projectId, workspace, version: 0, updatedAt: null };
}

export async function addTaskRelation(
  _task: Task,
  _type: IssueRelationType,
  _relatedTaskId: string,
  _threadId?: string,
): Promise<{ task: Task; relatedTask: Task }> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "任务关系尚未对接" } });
}

export async function removeTaskRelation(
  _task: Task,
  _type: IssueRelationType,
  _relatedTaskId: string,
  _threadId?: string,
): Promise<{ task: Task; relatedTask: Task }> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "任务关系尚未对接" } });
}

export async function createComment(
  _taskId: string,
  _body: string,
  _threadId?: string,
): Promise<Comment> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "评论尚未对接" } });
}

export async function updateComment(
  _comment: Comment,
  _body: string,
  _threadId?: string,
): Promise<Comment> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "评论尚未对接" } });
}

export async function deleteComment(_comment: Comment, _threadId?: string): Promise<void> {}

export async function uploadAttachment(
  _taskId: string,
  _file: File,
): Promise<Attachment> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "附件尚未对接" } });
}

export async function uploadCommentAttachment(
  _commentId: string,
  _file: File,
): Promise<Attachment> {
  throw new ApiError(501, { error: { code: "NOT_SUPPORTED", message: "附件尚未对接" } });
}

export async function deleteAttachment(_attachment: Attachment): Promise<void> {}

export function attachmentContentUrl(attachment: Attachment): string {
  return `/api/attachments/${encodeURIComponent(attachment.id)}/content`;
}
