// PluginRegistry：静态注册 + 按生命周期分发。
// 按插件注册顺序分发；单个插件抛错只记录日志，不阻断其他插件。

import { createPluginContext } from "./context.js";
import type {
  AgentEndEvent,
  AgentSettledEvent,
  BeforeAgentStartEvent,
  BeforeAgentStartResult,
  ContextEvent,
  PluginContext,
  RouteHandler,
  RouteRegistrar,
  SessionBeforeCompactEvent,
  SessionBeforeCompactResult,
  SessionShutdownEvent,
  SessionStartEvent,
  ToolCallDecision,
  ToolCallEvent,
  ToolResultEvent,
  ToolResultPatch,
  ToolDefinition,
  YunfengPlugin,
} from "./types.js";

/** 每个事件的事件载荷与分发返回值契约。 */
interface EventContract {
  session_start: { payload: SessionStartEvent; result: void };
  before_agent_start: { payload: BeforeAgentStartEvent; result: BeforeAgentStartResult | void };
  context: { payload: ContextEvent; result: { messages: unknown[] } | void };
  tool_call: { payload: ToolCallEvent; result: ToolCallDecision | void };
  tool_result: { payload: ToolResultEvent; result: ToolResultPatch | void };
  agent_end: { payload: AgentEndEvent; result: void };
  agent_settled: { payload: AgentSettledEvent; result: void };
  session_before_compact: { payload: SessionBeforeCompactEvent; result: SessionBeforeCompactResult | void };
  session_shutdown: { payload: SessionShutdownEvent; result: void };
}

export interface CollectedRoute {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  handler: RouteHandler;
}

export class PluginRegistry {
  private readonly plugins: YunfengPlugin[];
  private initialized = false;

  constructor(plugins: YunfengPlugin[]) {
    this.plugins = plugins.filter((plugin) => plugin.enabled !== false);
  }

  async initAll(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    for (const plugin of this.plugins) {
      if (!plugin.init) continue;
      try {
        await plugin.init(this.makeContext());
      } catch (error) {
        console.error(`[plugin] ${plugin.id} init failed:`, error instanceof Error ? error.message : error);
      }
    }
  }

  async disposeAll(): Promise<void> {
    if (!this.initialized) return;
    this.initialized = false;
    // 逆序释放，依赖方先退出
    for (const plugin of [...this.plugins].reverse()) {
      if (!plugin.dispose) continue;
      try {
        await plugin.dispose();
      } catch (error) {
        console.error(`[plugin] ${plugin.id} dispose failed:`, error instanceof Error ? error.message : error);
      }
    }
  }

  /** 按插件注册顺序分发事件；返回链式聚合结果。 */
  async dispatch<K extends keyof EventContract>(
    event: K,
    payload: EventContract[K]["payload"],
  ): Promise<EventContract[K]["result"]> {
    let chained: unknown = undefined;

    for (const plugin of this.plugins) {
      const handler = plugin.on?.[event];
      if (!handler) continue;
      try {
        const result = await (handler as (payload: unknown, ctx: PluginContext) => Promise<unknown>)(payload, this.makeContext());
        chained = this.mergeResult(event, chained, result);
        // tool_call 拦截语义：首个 block 即短路，不再调用后续插件
        if (event === "tool_call" && this.isBlockingToolCall(chained)) break;
      } catch (error) {
        console.error(`[plugin] ${plugin.id} handler "${event}" failed:`, error instanceof Error ? error.message : error);
      }
    }

    return chained as EventContract[K]["result"];
  }

  listTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const plugin of this.plugins) {
      if (!plugin.tools) continue;
      try {
        tools.push(...plugin.tools());
      } catch (error) {
        console.error(`[plugin] ${plugin.id} tools() failed:`, error instanceof Error ? error.message : error);
      }
    }
    return tools;
  }

  /** 收集所有插件贡献的 HTTP 路由（按插件注册顺序）。 */
  collectRoutes(): CollectedRoute[] {
    const routes: CollectedRoute[] = [];
    const registrar: RouteRegistrar = {
      get: (path, handler) => routes.push({ method: "get", path, handler }),
      post: (path, handler) => routes.push({ method: "post", path, handler }),
      patch: (path, handler) => routes.push({ method: "patch", path, handler }),
      delete: (path, handler) => routes.push({ method: "delete", path, handler }),
    };
    for (const plugin of this.plugins) {
      if (!plugin.routes) continue;
      try {
        plugin.routes(registrar);
      } catch (error) {
        console.error(`[plugin] ${plugin.id} routes() failed:`, error instanceof Error ? error.message : error);
      }
    }
    return routes;
  }

  private makeContext(): PluginContext {
    return createPluginContext();
  }

  /** 链式合并：before_agent_start 聚合 message/systemPrompt；tool_result 补丁合并；context 用最新替换。 */
  private mergeResult(event: keyof EventContract, chained: unknown, result: unknown): unknown {
    if (result === undefined || result === null) return chained;

    if (event === "before_agent_start") {
      const next = result as BeforeAgentStartResult;
      const prev = (chained ?? {}) as BeforeAgentStartResult;
      const message = next.message
        ? prev.message
          ? {
              customType: prev.message.customType,
              content: `${prev.message.content}\n\n${next.message.content}`,
              display: prev.message.display ?? next.message.display,
            }
          : next.message
        : prev.message;
      const systemPrompt = next.systemPrompt
        ? prev.systemPrompt
          ? `${prev.systemPrompt}\n\n${next.systemPrompt}`
          : next.systemPrompt
        : prev.systemPrompt;
      if (!message && !systemPrompt) return undefined;
      return { message, systemPrompt };
    }

    if (event === "tool_result") {
      // 对齐 pi：tool_result 处理器像中间件一样链式累积补丁
      return { ...(chained as ToolResultPatch | undefined), ...(result as ToolResultPatch) };
    }

    if (event === "context") {
      return result;
    }

    return chained ?? result;
  }

  private isBlockingToolCall(value: unknown): boolean {
    return Boolean(value && typeof value === "object" && (value as ToolCallDecision).block === true);
  }
}
