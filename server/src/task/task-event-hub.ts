// TaskEventHub：任务事件的分发与断线重放。
// 事件写入 events.jsonl 持久化；SSE 客户端按 seq 补发，断线重连用 Last-Event-ID 对齐。

import { randomUUID } from "node:crypto";
import type { TaskEvent, TaskEventListener } from "./types.js";
import type { TaskStore } from "./task-store.js";

interface SseClient {
  taskId: string;
  lastSeq: number;
  write: (chunk: string) => void;
  close: () => void;
  closed: boolean;
}

/**
 * TaskEventHub 负责：
 * - 用户发起的领域事件分发（emit，写入存储并通知订阅者）。
 * - 任务详情 SSE 订阅（按 seq 补发）。
 * - 工作台摘要事件订阅（所有任务的新事件）。
 * 清理逻辑返回 unsubscribe 回调，由连接层在关闭时调用。
 */
export class TaskEventHub {
  private readonly store: TaskStore;
  private readonly taskListeners = new Map<string, Set<TaskEventListener>>();
  private readonly globalListeners = new Set<TaskEventListener>();
  private readonly taskSse = new Map<string, Set<SseClient>>();
  private readonly globalSse = new Set<SseClient>();

  constructor(store: TaskStore) {
    this.store = store;
  }

  /** 创建并持久化一个领域事件，返回事件对象。 */
  async emit(taskId: string, type: TaskEvent["type"], data: unknown): Promise<TaskEvent> {
    const seq = this.store.reserveSeq(taskId);
    const event: TaskEvent = {
      id: randomUUID(),
      taskId,
      seq,
      occurredAt: new Date().toISOString(),
      type,
      data: data as never,
    };
    this.store.appendEvent(event);
    this.store.update(taskId, (state) => {
      state.lastEventSeq = seq;
    });
    // 分发给详情订阅者
    const listeners = this.taskListeners.get(taskId);
    if (listeners) {
      for (const listener of [...listeners]) {
        try { listener(event); } catch { /* ignore */ }
      }
    }
    // 分发给工作台订阅者
    for (const listener of [...this.globalListeners]) {
      try { listener(event); } catch { /* ignore */ }
    }
    // 推送给 SSE 客户端（详情 + 全局都推送）
    const taskClients = this.taskSse.get(taskId);
    if (taskClients) this.pushToClients(taskClients, event);
    this.pushToClients([...this.globalSse].filter((c) => c.taskId === taskId || c.taskId === "*"), event);
    return event;
  }

  private pushToClients(clients: Iterable<SseClient>, event: TaskEvent): void {
    for (const client of clients) {
      if (client.closed) continue;
      client.lastSeq = event.seq;
      client.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  }

  subscribeTask(taskId: string, listener: TaskEventListener): () => void {
    let set = this.taskListeners.get(taskId);
    if (!set) {
      set = new Set();
      this.taskListeners.set(taskId, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  subscribeGlobal(listener: TaskEventListener): () => void {
    this.globalListeners.add(listener);
    return () => { this.globalListeners.delete(listener); };
  }

  /**
   * 注册一个任务详情的 SSE 客户端。
   * 立即补发 afterSeq 之后的事件，返回清理回调。
   */
  subscribeTaskSse(
    taskId: string,
    writer: (chunk: string) => void,
    closer: () => void,
    afterSeq = 0,
  ): () => void {
    const client: SseClient = {
      taskId,
      lastSeq: afterSeq,
      write: writer,
      close: closer,
      closed: false,
    };
    let set = this.taskSse.get(taskId);
    if (!set) {
      set = new Set();
      this.taskSse.set(taskId, set);
    }
    set.add(client);

    // 补发错过的历史事件
    const backlog = this.store.readEvents(taskId, afterSeq);
    const connected: TaskEvent = {
      id: randomUUID(),
      taskId,
      seq: afterSeq,
      occurredAt: new Date().toISOString(),
      type: "task_updated",
      data: { kind: "connected", fromSeq: afterSeq, backlogCount: backlog.length },
    };
    client.write(`id: ${afterSeq}\ndata: ${JSON.stringify(connected)}\n\n`);
    for (const event of backlog) {
      client.lastSeq = event.seq;
      client.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
    }

    const cleanup = () => {
      client.closed = true;
      set?.delete(client);
      if (set?.size === 0) this.taskSse.delete(taskId);
    };
    return cleanup;
  }

  /**
   * 注册一个工作台（全局任务摘要）SSE 客户端。
   * 事件流以各任务真实状态事件为主，返回清理回调。
   */
  subscribeGlobalSse(writer: (chunk: string) => void, closer: () => void): () => void {
    const client: SseClient = {
      taskId: "*",
      lastSeq: 0,
      write: writer,
      close: closer,
      closed: false,
    };
    this.globalSse.add(client);
    const cleanup = () => {
      client.closed = true;
      this.globalSse.delete(client);
    };
    return cleanup;
  }
}
