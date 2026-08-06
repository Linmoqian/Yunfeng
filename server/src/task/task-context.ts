// TaskContext：进程内共享的房间单例（TaskStore / TaskEventHub / TaskRuntime）。
// 便于路由层与 pi 事件桥接层复用同一实例。

import { TaskStore } from "./task-store.js";
import { TaskEventHub } from "./task-event-hub.js";
import { TaskRuntime } from "./task-runtime.js";

declare global {
  var __yfContext: { store: TaskStore; hub: TaskEventHub; runtime: TaskRuntime } | undefined;
}

export function getTaskContext(): { store: TaskStore; hub: TaskEventHub; runtime: TaskRuntime } {
  if (!globalThis.__yfContext) {
    const store = new TaskStore();
    const hub = new TaskEventHub(store);
    const runtime = new TaskRuntime({ store, hub });
    globalThis.__yfContext = { store, hub, runtime };
  }
  return globalThis.__yfContext;
}

/** 测试用：使用独立数据目录重建上下文。 */
export function createTaskContextForDataDir(dataDir: string): { store: TaskStore; hub: TaskEventHub; runtime: TaskRuntime } {
  const store = new TaskStore({ dataDir });
  const hub = new TaskEventHub(store);
  const runtime = new TaskRuntime({ store, hub });
  return { store, hub, runtime };
}
