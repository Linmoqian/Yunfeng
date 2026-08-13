// Yunfeng 插件系统接口（第一版）。
// 事件命名与拦截语义对齐 pi extensions（docs/extensions.md），
// 但类型与上下文是 Yunfeng 自有领域协议，不暴露 pi 对象。
// 权威设计文档：docs/design/plugin-system.md。

import type { RouteResult } from "../routes.js";
export type { RouteResult };

// ---------------------------------------------------------------------------
// 插件本体
// ---------------------------------------------------------------------------

export interface YunfengPlugin {
  /** 稳定 ID，如 "memory" */
  id: string;
  /** 依赖的其他插件 ID（预留，第一版不实现） */
  dependencies?: string[];
  /** 是否启用；默认 true。registry 在构造时过滤 disabled 插件 */
  enabled?: boolean;
  /** 注册 LLM 可调工具（对齐 pi.registerTool；第一版不桥接，仅声明） */
  tools?(): ToolDefinition[];
  /** 贡献 HTTP 路由（Yunfeng 特有：pi 扩展没有 HTTP 入口） */
  routes?(routes: RouteRegistrar): void;
  /** 事件订阅（对齐 pi.on，事件名一一对应） */
  on?: PluginEventHandlers;
  /** 进程启动时调用；异步初始化完成后才继续启动（对齐 pi 的 async factory） */
  init?(ctx: PluginContext): void | Promise<void>;
  /** 进程退出或插件卸载时调用 */
  dispose?(): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// 事件处理器（事件名与拦截语义对齐 pi）
// ---------------------------------------------------------------------------

export interface PluginEventHandlers {
  session_start?(event: SessionStartEvent, ctx: PluginContext): void | Promise<void>;
  before_agent_start?(
    event: BeforeAgentStartEvent,
    ctx: PluginContext,
  ): BeforeAgentStartResult | void | Promise<BeforeAgentStartResult | void>;
  context?(
    event: ContextEvent,
    ctx: PluginContext,
  ): { messages: unknown[] } | void | Promise<{ messages: unknown[] } | void>;
  tool_call?(
    event: ToolCallEvent,
    ctx: PluginContext,
  ): ToolCallDecision | void | Promise<ToolCallDecision | void>;
  tool_result?(
    event: ToolResultEvent,
    ctx: PluginContext,
  ): ToolResultPatch | void | Promise<ToolResultPatch | void>;
  agent_end?(event: AgentEndEvent, ctx: PluginContext): void | Promise<void>;
  agent_settled?(event: AgentSettledEvent, ctx: PluginContext): void | Promise<void>;
  session_before_compact?(
    event: SessionBeforeCompactEvent,
    ctx: PluginContext,
  ): SessionBeforeCompactResult | void | Promise<SessionBeforeCompactResult | void>;
  session_shutdown?(event: SessionShutdownEvent, ctx: PluginContext): void | Promise<void>;
}

// 事件载荷（字段名对齐 pi，去掉 pi 独有细节）

export interface SessionStartEvent {
  reason: "startup" | "new" | "resume" | "fork" | "reload";
  sessionId: string;
  cwd: string;
  previousSessionFile?: string;
}

export interface BeforeAgentStartEvent {
  prompt: string;
  systemPrompt: string;
  sessionId: string;
  cwd: string;
}

export interface BeforeAgentStartResult {
  /** 注入一条持久消息（参与 LLM 上下文；第一版由调用方拼接到 prompt 文本） */
  message?: { customType: string; content: string; display?: boolean };
  /** 替换本轮系统提示词（跨处理器链式拼接；第一版不生效） */
  systemPrompt?: string;
}

export interface ContextEvent {
  /** 深拷贝，可安全修改 */
  messages: unknown[];
}

export interface ToolCallEvent {
  toolName: string;
  toolCallId: string;
  /** 可变：就地修改影响实际执行 */
  input: Record<string, unknown>;
}

export type ToolCallDecision =
  | { block: true; reason?: string; terminate?: boolean }
  | { block?: false };

export interface ToolResultEvent {
  toolName: string;
  toolCallId: string;
  content: unknown;
  details: unknown;
  isError: boolean;
}

export type ToolResultPatch = Partial<Pick<ToolResultEvent, "content" | "details" | "isError">>;

export interface AgentEndEvent {
  sessionId: string;
  cwd: string;
}

export interface AgentSettledEvent {
  sessionId: string;
  cwd: string;
}

export interface SessionBeforeCompactEvent {
  reason: "manual" | "threshold" | "overflow";
  sessionId: string;
}

export type SessionBeforeCompactResult =
  | { cancel: true }
  | { compaction: { summary: string; firstKeptEntryId?: string } };

export interface SessionShutdownEvent {
  reason: "quit" | "reload" | "new" | "resume" | "fork";
  sessionId: string;
}

// ---------------------------------------------------------------------------
// 上下文与能力
// ---------------------------------------------------------------------------

export interface PluginContext {
  sessionId: string;
  cwd: string;
  /** 插件间共享事件总线（对齐 pi.events） */
  events: PluginEventBus;
  /** 领域服务访问：只暴露稳定服务，不暴露 pi 对象（第一版为空，后续扩展） */
  services: PluginServices;
  /** 当前 agent 中止信号（对齐 ctx.signal） */
  signal?: AbortSignal;
}

export interface PluginEventBus {
  on(event: string, handler: (data: unknown) => void): () => void;
  emit(event: string, data: unknown): void;
}

export interface PluginServices {
  readonly [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  /** 参数定义用 JSON Schema 形状（对齐 pi 的 typebox schema，但不引入 typebox 依赖） */
  parameters: Record<string, unknown>;
  execute(
    params: Record<string, unknown>,
    ctx: { signal?: AbortSignal; cwd: string },
  ): Promise<{ content: unknown; details?: unknown }>;
}

// ---------------------------------------------------------------------------
// HTTP 路由能力
// ---------------------------------------------------------------------------

export interface RouteContext {
  method: string;
  /** 已剥离 /api 前缀的路由路径 */
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown>;
}

export type RouteHandler = (ctx: RouteContext) => RouteResult | Promise<RouteResult>;

export interface RouteRegistrar {
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
  patch(path: string, handler: RouteHandler): void;
  delete(path: string, handler: RouteHandler): void;
}
