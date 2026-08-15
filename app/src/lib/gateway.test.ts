// GatewayClient 单测：请求头、REST 调用与 SSE 订阅（fetch/EventSource 用 mock）。

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GatewayClient,
  isGatewayConfigured,
  loadGatewaySettings,
  saveGatewaySettings,
} from "./gateway";
import type { TaskStreamEvent } from "./types";

const client = new GatewayClient("http://192.168.1.10:8787", "tok");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GatewayClient REST", () => {
  it("请求头携带 Bearer token 与 JSON 类型", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tasks: [], total: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    await client.loadTasks({ status: "running" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.10:8787/api/tasks?status=running",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("createTask 发送消息体", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ task: { id: "t1" }, sessionId: "s1" }));
    vi.stubGlobal("fetch", fetchMock);
    await client.createTask("你好");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.10:8787/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "你好" }),
      }),
    );
  });

  it("loadTaskConversation 为消息补 entry id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          context: {
            messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
            entryIds: ["e1", "e2"],
          },
        }),
      ),
    );
    const messages = await client.loadTaskConversation("t1");
    expect(messages.map((m) => m.id)).toEqual(["e1", "e2"]);
  });

  it("HTTP 错误时抛出结构化 error.message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "任务不存在" } }, 404)));
    await expect(client.sendTaskCommand("t1", { type: "abort" })).rejects.toThrow("任务不存在");
  });
});

describe("GatewayClient.subscribeTaskEvents", () => {
  it("SSE token 走 query，事件与取消订阅可用", () => {
    const instances: Array<{
      url: string;
      onmessage: ((ev: MessageEvent) => void) | null;
      close: () => void;
    }> = [];
    class FakeEventSource {
      url: string;
      onopen: (() => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        this.url = url;
        instances.push(this);
      }
      close = vi.fn();
    }
    vi.stubGlobal("EventSource", FakeEventSource);

    const events: TaskStreamEvent[] = [];
    const unsubscribe = client.subscribeTaskEvents("t1", (event) => events.push(event));
    expect(instances[0].url).toBe("http://192.168.1.10:8787/api/tasks/t1/events?token=tok");

    instances[0].onmessage?.({
      data: JSON.stringify({ type: "message_delta", data: { delta: "hi" } }),
    } as MessageEvent);
    expect(events[0]?.type).toBe("message_delta");

    unsubscribe();
    expect(instances[0].close).toHaveBeenCalled();
  });
});

describe("网关设置持久化", () => {
  it("保存后可读回，未配置判定准确", () => {
    const storage = new Map<string, string>();
    const fakeStorage: Storage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      length: storage.size,
    };
    expect(isGatewayConfigured(loadGatewaySettings(fakeStorage))).toBe(false);
    saveGatewaySettings({ baseUrl: "http://10.0.0.5:8787/", token: "abc" }, fakeStorage);
    expect(loadGatewaySettings(fakeStorage)).toEqual({ baseUrl: "http://10.0.0.5:8787", token: "abc" });
    expect(isGatewayConfigured(loadGatewaySettings(fakeStorage))).toBe(true);
  });
});

describe("GatewayClient 任务操作", () => {
  it("renameTask 使用 PATCH 并返回 task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ task: { id: "t1", title: "新名字" } }));
    vi.stubGlobal("fetch", fetchMock);
    const task = await client.renameTask("t1", "新名字");
    expect(task.title).toBe("新名字");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.10:8787/api/tasks/t1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "新名字" }),
      }),
    );
  });

  it("resolveIntervention 发送 approve/reject 决策", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await client.resolveIntervention("t1", "r1", "approve");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.10:8787/api/tasks/t1/interventions/r1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }),
    );
  });

  it("loadTaskInterventions 返回 pending 列表", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ interventions: [{ id: "r1", status: "pending" }] })),
    );
    await expect(client.loadTaskInterventions("t1")).resolves.toEqual([{ id: "r1", status: "pending" }]);
  });
});
