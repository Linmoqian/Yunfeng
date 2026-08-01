// 与前端共享的类型定义。

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
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface SessionContext {
  messages: SessionMessage[];
  entryIds: string[];
  thinkingLevel: string | undefined;
  model: { provider: string; modelId: string } | undefined;
}
