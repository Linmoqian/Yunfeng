// 前端类型定义（与 sidecar 约定一致）。

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

export interface SidecarInfo {
  port: number;
  token: string;
  base_url: string;
}

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

export interface SessionMessage {
  role: string;
  content: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

export interface SessionContext {
  messages: SessionMessage[];
  entryIds: string[];
  thinkingLevel: string | undefined;
  model: { provider: string; modelId: string } | undefined;
}

export interface SessionState {
  sessionId: string;
  sessionFile: string;
  isStreaming: boolean;
  isPromptRunning: boolean;
  isBashRunning: boolean;
  isCompacting: boolean;
  autoCompactionEnabled: boolean;
  autoRetryEnabled: boolean;
  model: { id: string; provider: string } | undefined;
  pendingMessageCount: number;
  queuedMessages: { steering: string[]; followUp: string[] };
  contextUsage: { percent: number | null; contextWindow: number; tokens: number | null } | null;
  systemPrompt: string;
  thinkingLevel: string;
}
