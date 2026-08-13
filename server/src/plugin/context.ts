// PluginContext 组装：为插件分发构造上下文。
// events 总线在插件之间共享；services 只暴露内核稳定服务（第一版为空）。

import type {
  PluginContext,
  PluginEventBus,
  PluginServices,
} from "./types.js";

interface ContextOptions {
  sessionId?: string;
  cwd?: string;
  signal?: AbortSignal;
  /** 测试用：注入自定义 services */
  services?: PluginServices;
}

export function createPluginContext(options: ContextOptions = {}): PluginContext {
  return {
    sessionId: options.sessionId ?? "",
    cwd: options.cwd ?? process.cwd(),
    events: createEventBus(),
    services: options.services ?? {},
    signal: options.signal,
  };
}

function createEventBus(): PluginEventBus {
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      return () => set.delete(handler);
    },
    emit(event, data) {
      const set = handlers.get(event);
      if (!set) return;
      for (const handler of [...set]) {
        try {
          handler(data);
        } catch (error) {
          console.error(`[plugin] event bus handler for "${event}" failed:`, error instanceof Error ? error.message : error);
        }
      }
    },
  };
}
