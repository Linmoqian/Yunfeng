// B 方案核心：基于官方 RpcClient 的会话封装与注册表。
// 每个会话 = 一个 pi 子进程（--mode rpc），通过 JSONL 通信。
// 复用官方 @earendil-works/pi-coding-agent 的 RpcClient，不自行实现 wrapper。

import { createRequire } from "node:module";
import {
  RpcClient,
  type RpcCommand,
  type RpcEventListener,
  type RpcResponse,
} from "@earendil-works/pi-coding-agent";
import type { AgentEvent, EventListener } from "./types.js";

const require = createRequire(import.meta.url);

/** 解析 npm 包内 dist/cli.js 的绝对路径。 */
function resolveCliPath(): string {
  // 优先环境变量覆盖（测试/调试用）
  if (process.env.PI_CLI_PATH) return process.env.PI_CLI_PATH;

  const { existsSync } = require("node:fs");
  const { join } = require("node:path");
  const candidates = [
    // 本包目录
    join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
    // 上级目录（monorepo/被引用场景）
    join(process.cwd(), "..", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Cannot locate @earendil-works/pi-coding-agent/dist/cli.js; set PI_CLI_PATH");
}

const CLI_PATH = resolveCliPath();

export interface RpcSessionStartOptions {
  toolNames?: string[];
  initialModel?: { provider: string; modelId: string };
  thinkingLevel?: string;
  args?: string[];
}

/**
 * 单个 pi 子进程封装：持有官方 RpcClient，转发事件，管理生命周期。
 */
export class RpcSessionHandle {
  private listeners: EventListener[] = [];
  private unsubscribe: (() => void) | null = null;
  private _alive = false;
  private _cwd = "";
  private _sessionId = "";
  private onDestroyCallback: (() => void) | null = null;

  constructor(public readonly client: RpcClient) {}

  get cwd(): string {
    return this._cwd;
  }

  /** pi 子进程内的真实会话 id。 */
  get sessionId(): string {
    return this._sessionId;
  }

  setSessionId(id: string): void {
    this._sessionId = id;
  }

  isAlive(): boolean {
    return this._alive;
  }

  /** 事件是否正在活动（官方状态字段近似）。 */
  isRunning(): boolean {
    return this._alive;
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  /** 启动子进程并订阅事件。 */
  async start(cwd: string): Promise<void> {
    if (this._alive) return;
    this._cwd = cwd;
    await this.client.start();
    this._alive = true;
    this.unsubscribe = this.client.onEvent(((event: unknown) => {
      this.emit(event as AgentEvent);
    }) as RpcEventListener);
  }

  /** 发送官方命令。 */
  send(command: RpcCommand): Promise<RpcResponse> {
    if (!this._alive) throw new Error("Session not running");
    // RpcClient 内部 send 是私有的；用其公开方法不适合动态分发，
    // 通过类型断言调用内部 send。
    return (this.client as unknown as { send(c: RpcCommand): Promise<RpcResponse> }).send(command);
  }

  private emit(event: AgentEvent): void {
    for (const l of this.listeners) l(event);
  }

  async destroy(): Promise<void> {
    if (!this._alive) return;
    this._alive = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.client.stop();
    this.onDestroyCallback?.();
  }
}

// ============================================================================
// 会话注册表
// ============================================================================

declare global {
  var __rpcSessions: Map<string, RpcSessionHandle> | undefined;
  var __rpcStartLocks: Map<string, Promise<RpcSessionHandle>> | undefined;
}

function getRegistry(): Map<string, RpcSessionHandle> {
  if (!globalThis.__rpcSessions) {
    globalThis.__rpcSessions = new Map();
    const cleanup = () => {
      for (const s of [...globalThis.__rpcSessions!.values()]) void s.destroy();
    };
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__rpcSessions;
}

function getLocks(): Map<string, Promise<RpcSessionHandle>> {
  if (!globalThis.__rpcStartLocks) globalThis.__rpcStartLocks = new Map();
  return globalThis.__rpcStartLocks;
}

export function getRpcSession(sessionId: string): RpcSessionHandle | undefined {
  return getRegistry().get(sessionId);
}

export function getRunningRpcSessionIds(): string[] {
  const ids: string[] = [];
  for (const [sessionId, session] of getRegistry()) {
    if (session.isRunning()) ids.push(sessionId);
  }
  return ids;
}

/**
 * 获取或创建会话子进程。
 * - sessionId 存在且存活：复用
 * - 新会话：spawn pi 子进程（--mode rpc --session <id>）
 * - 打开已有会话：--session <file> 指向 JSONL
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  options: RpcSessionStartOptions = {},
): Promise<RpcSessionHandle> {
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) return existing;

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const args: string[] = [];
    if (sessionFile) {
      args.push("--session", sessionFile);
    }
    if (options.args) args.push(...options.args);

    const client = new RpcClient({
      cliPath: CLI_PATH,
      cwd,
      ...(options.initialModel ? { provider: options.initialModel.provider, model: options.initialModel.modelId } : {}),
      args,
    });

    const handle = new RpcSessionHandle(client);
    await handle.start(cwd);

    // 从官方 get_state 查询真实会话 id，作为注册表主 key。
    let realSessionId = sessionId;
    try {
      const send = (client as unknown as { send(c: RpcCommand): Promise<RpcResponse> }).send;
      const response = await send.call(client, { type: "get_state" } as RpcCommand);
      if (response.success) {
        const state = (response as { data?: { sessionId?: string } }).data;
        if (state?.sessionId) realSessionId = state.sessionId;
      }
    } catch {
      // 查询失败则沿用传入 key
    }
    handle.setSessionId(realSessionId);

    // 若临时 key ≠ 真实 id，同时注册两个 key 指向同一 handle
    handle.onDestroy(() => {
      registry.delete(sessionId);
      registry.delete(realSessionId);
    });
    registry.set(sessionId, handle);
    registry.set(realSessionId, handle);
    return handle;
  })().finally(() => {
    locks.delete(sessionId);
  });

  locks.set(sessionId, starting);
  return starting;
}

export function destroyAllSessions(): void {
  for (const s of [...getRegistry().values()]) void s.destroy();
  getRegistry().clear();
}
