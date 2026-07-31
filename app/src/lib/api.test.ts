// SidecarClient 单测：SSE 解析与 HTTP 错误处理（fetch 用 mock）。

import { afterEach, describe, expect, it, vi } from "vitest";
import { SidecarClient } from "./api";
import type { AgentEvent } from "./types";

const client = new SidecarClient("http://127.0.0.1:9999", "tok");

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("SidecarClient.subscribeEvents", () => {
  it("按 data: 行解析事件，忽略心跳与坏事件", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"type":"connected","sessionId":"s1"}\n\n',
        ": heartbeat\n\n",
        'data: {"type":"message_update"}\n\ndata: not-json\n\n',
        'data: {"type":"agent_end"}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve) => {
      client.subscribeEvents("s1", (e) => {
        events.push(e);
        if (e.type === "agent_end") resolve();
      });
    });

    expect(events.map((e) => e.type)).toEqual(["connected", "message_update", "agent_end"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9999/api/rpc/s1/events",
      expect.objectContaining({ headers: { "X-Pi-Token": "tok" } }),
    );
  });

  it("事件被拆成多个 chunk 时仍能完整解析", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'data: {"type":"mess',
          'age_update","content":"hi"}\n\ndata: {"type":"a',
          'gent_end"}\n\n',
        ]),
      ),
    );

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve) => {
      client.subscribeEvents("s1", (e) => {
        events.push(e);
        if (e.type === "agent_end") resolve();
      });
    });

    expect(events).toEqual([
      { type: "message_update", content: "hi" },
      { type: "agent_end" },
    ]);
  });

  it("返回的取消函数中止连接", () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    const unsubscribe = client.subscribeEvents("s1", () => {});
    unsubscribe();
    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });

  it("HTTP 错误时回调 onError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );
    const onError = vi.fn();
    client.subscribeEvents("s1", () => {}, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0].message).toMatch(/500/);
  });
});

describe("SidecarClient.request", () => {
  it("成功时返回 body.data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 }),
      ),
    );
    await expect(client.getHealth()).resolves.toEqual({ ok: true });
  });

  it("HTTP 错误时抛出服务端 error 消息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      ),
    );
    await expect(client.getHealth()).rejects.toThrow("boom");
  });

  it("请求头携带 X-Pi-Token 与 JSON 类型", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { sessions: [] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await client.listSessions();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9999/api/sessions",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Pi-Token": "tok", "Content-Type": "application/json" }),
      }),
    );
  });
});
