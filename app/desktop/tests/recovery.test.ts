/* 读取退避、监听恢复和退出回收的核心回归。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, it, vi } from "vitest";
import { fetchRead, recoverSubscription } from "../src/services/recovery";
import { subscribeTaskEvents } from "../src/services/taskService";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("网关暂不可达后自动恢复读取，权限错误不重试，等待可取消", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 502 })).mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const request = fetchRead("/api/tasks");
  await vi.advanceTimersByTimeAsync(500);
  expect((await request).status).toBe(200);
  fetch.mockResolvedValue(new Response("", { status: 403 }));
  expect((await fetchRead("/api/tasks")).status).toBe(403);
  expect(fetch).toHaveBeenCalledTimes(3);
  fetch.mockResolvedValue(new Response("", { status: 503 }));
  const controller = new AbortController();
  const cancelled = expect(fetchRead("/api/tasks", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); await cancelled;
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("监听注册失败后自动重试且卸载不会遗留监听", async () => {
  vi.useFakeTimers();
  const unsubscribe = vi.fn();
  const register = vi.fn().mockRejectedValueOnce(new Error("IPC restarting")).mockResolvedValue(unsubscribe);
  const stop = await recoverSubscription(register);
  await vi.advanceTimersByTimeAsync(500);
  expect(register).toHaveBeenCalledTimes(2);
  stop(); expect(unsubscribe).toHaveBeenCalledTimes(1);
  let resolve!: (stop: () => void) => void;
  const cleanup = await recoverSubscription(() => new Promise((done) => { resolve = done; }));
  cleanup(); resolve(unsubscribe); await Promise.resolve();
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});
it("永久关闭的事件流重建时保留游标，取消后停止重连", async () => {
  vi.useFakeTimers();
  const sources: FakeSource[] = [];
  class FakeSource {
    static CLOSED = 2; readyState = 1;
    onopen?: () => void; onerror?: () => void; onmessage?: (event: { data: string; lastEventId: string }) => void;
    close = vi.fn(); constructor(public url: string) { sources.push(this); }
  }
  vi.stubGlobal("EventSource", FakeSource);
  const event = vi.fn(); const stop = subscribeTaskEvents("task", event);
  sources[0].onmessage?.({ data: '{"type":"task_updated"}', lastEventId: "12" });
  sources[0].readyState = 2; sources[0].onerror?.();
  await vi.advanceTimersByTimeAsync(500);
  expect(sources[1].url).toBe("/api/tasks/task/events?afterSeq=12");
  sources[1].readyState = 2; sources[1].onerror?.(); stop();
  await vi.advanceTimersByTimeAsync(10000); expect(sources).toHaveLength(2);
});
