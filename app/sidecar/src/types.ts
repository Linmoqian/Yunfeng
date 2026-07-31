// Sidecar 与前端共享的类型定义。

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
