// 与前端共享的类型定义（镜像 pi-web lib/api-types.ts 核心结构）。

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

export type EventListener = (event: AgentEvent) => void;

export interface SessionInfo {
  path: string;
  id: string;
  cwd: string | undefined;
  name: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId: string | undefined;
  projectRoot: string | undefined;
  worktreeBranch?: string;
}

export interface SessionMessage {
  role: string;
  content: unknown;
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface SessionContext {
  messages: SessionMessage[];
  entryIds: string[];
  thinkingLevel: string | undefined;
  model: { provider: string; modelId: string } | undefined;
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  supportsThinking: boolean;
}

export interface ProviderAuthStatus {
  id: string;
  name: string;
  authMethods: string[];
  configured: boolean;
}

export interface ModelsResult {
  providers: ProviderAuthStatus[];
  available: ModelInfo[];
  enabled: string[];
  defaultProvider: string | undefined;
  defaultModel: string | undefined;
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
}

export interface RpcSessionStartOptions {
  toolNames?: string[];
  initialModel?: { provider: string; modelId: string };
  thinkingLevel?: string;
}

export interface GitFileStatus {
  filePath: string;
  status: "modified" | "added" | "deleted" | "untracked" | "renamed" | "copied" | "updated" | "unmerged";
  indexStatus: string;
  worktreeStatus: string;
}

export interface GitStatusResponse {
  isGitRepository: boolean;
  repositoryRoot: string | null;
  files: GitFileStatus[];
  additions: number;
  deletions: number;
}

export interface GitFileDiffResponse {
  supported: boolean;
  status?: GitFileStatus["status"];
  patch?: string;
}

export interface BrowsableDirectory {
  name: string;
  path: string;
}

export interface ProjectTrustStatus {
  requiresTrust: boolean;
  trusted: boolean;
}

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
  sourceInfo: {
    source?: string;
    scope?: string;
  };
}

export interface SkillsResponse {
  skills: SkillInfo[];
  diagnostics: Array<{ type: string; message: string; source?: string; path?: string }>;
  projectResourcesLoaded: boolean;
}

export interface ModelsData {
  models: Record<string, string>;
  modelList: { id: string; name: string; provider: string }[];
  defaultModel: { provider: string; modelId: string } | null;
  thinkingLevels: Record<string, string[]>;
  thinkingLevelMaps: Record<string, Record<string, string | null>>;
  thinkingLevelPins: Record<string, string>;
  modelError?: string;
  modelScopeWarnings?: string[];
}
