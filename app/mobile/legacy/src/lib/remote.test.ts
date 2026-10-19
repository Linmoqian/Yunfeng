// RemoteClient 纯逻辑单测：配对结果/错误映射、连接持久化、未连接时 send 不抛错。

import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadConnection, RemoteClient, saveConnection } from "./remote";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

describe("remote client", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it("save/loadConnection 持久化连接", () => {
    const conn = { baseUrl: "http://127.0.0.1:8787", token: "t0k3n", deviceId: "dev-1" };
    expect(loadConnection()).toBeNull();
    saveConnection(conn);
    expect(loadConnection()).toEqual(conn);
    saveConnection(null);
    expect(loadConnection()).toBeNull();
  });

  it("loadConnection 对损坏数据返回 null", () => {
    globalThis.localStorage.setItem("yunfeng.remote.connection", "{bad json");
    expect(loadConnection()).toBeNull();
  });

  it("pair 成功返回 deviceId/token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ deviceId: "dev-1", token: "abc" }),
      })),
    );
    const result = await RemoteClient.pair("http://127.0.0.1:8787/", "123456", "iPhone");
    expect(result).toEqual({ deviceId: "dev-1", token: "abc" });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/pair",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("pair 失败抛出服务端错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "pairing code expired" }),
      })),
    );
    await expect(RemoteClient.pair("http://x", "000000")).rejects.toThrow(
      "pairing code expired",
    );
  });

  it("未连接时 send 不抛错", () => {
    const client = new RemoteClient({ baseUrl: "http://x", token: "t", deviceId: "d" });
    expect(() => client.send({ type: "ping" })).not.toThrow();
    expect(client.connected).toBe(false);
  });
});
