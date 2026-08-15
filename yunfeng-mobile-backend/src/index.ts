// 装配：HTTP(REST 配对/设备/RustDesk) + WebSocket（远程桌面 fallback）、账号、生命周期。
// 职责收敛为“轻量移动后端”：配对与设备 token + RustDesk sidecar 生命周期。
// 任务与对话由电脑侧 yunfeng-server + yunfeng-gateway 提供，移动端直连网关。

import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Accounts } from "./accounts.ts";
import { loadConfig } from "./config.ts";
import type { Config } from "./types.ts";
import { openDb } from "./db.ts";
import {
  screencaptureCaptureOnce,
  swiftInputSender,
  type CaptureOnce,
  type InputSender,
} from "./desktop.ts";
import { Hub } from "./hub.ts";
import { RustDeskSidecar, type RustDeskMode } from "./rustdesk.ts";

export interface Backend {
  server: Server;
  accounts: Accounts;
  hub: Hub;
  rustdesk: RustDeskSidecar;
  config: Config;
  close: () => Promise<void>;
}

export interface BackendOverrides {
  captureOnce?: CaptureOnce;
  inputSender?: InputSender;
  rustdesk?: RustDeskSidecar;
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function bearerToken(req: IncomingMessage): string {
  const raw = req.headers["x-device-token"] ?? req.headers.authorization;
  if (typeof raw === "string" && raw.startsWith("Bearer ")) return raw.slice(7);
  return typeof raw === "string" ? raw : "";
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  accounts: Accounts,
  rustdesk: RustDeskSidecar,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/health") {
    const pairing = accounts.currentPairing();
    json(res, 200, {
      ok: true,
      version: 2,
      pairing: pairing
        ? { active: true, expiresIn: Math.max(0, Math.round((pairing.expiresAt - Date.now()) / 1000)) }
        : { active: false, expiresIn: 0 },
    });
    return;
  }

  if (method === "POST" && path === "/api/pair") {
    const body = await readJsonBody(req);
    const code = typeof body.code === "string" ? body.code : "";
    const name = typeof body.name === "string" ? body.name : undefined;
    try {
      json(res, 200, accounts.pair(code, name));
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (method === "POST" && path === "/api/pairing/rotate") {
    json(res, 200, accounts.rotatePairing());
    return;
  }

  const device = accounts.auth(bearerToken(req));

  // RustDesk sidecar（内嵌版）：配对设备可启动/停止并读取连接信息。
  if (method === "GET" && path === "/api/rustdesk/info") {
    if (!device) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    json(res, 200, await rustdesk.info());
    return;
  }
  if (method === "POST" && path === "/api/rustdesk/start") {
    if (!device) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    const body = await readJsonBody(req);
    const mode: RustDeskMode = body.mode === "gui" ? "gui" : "service";
    try {
      const password = await rustdesk.start(mode);
      const info = await rustdesk.info();
      json(res, 200, { ok: true, ...(password ? { password } : {}), ...info });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  if (method === "POST" && path === "/api/rustdesk/stop") {
    if (!device) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    await rustdesk.stop();
    json(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && path === "/api/devices") {
    if (!device) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    json(res, 200, { devices: accounts.listDevices() });
    return;
  }

  const revokeMatch = path.match(/^\/api\/devices\/([^/]+)$/);
  if (method === "DELETE" && revokeMatch) {
    if (!device) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    json(res, 200, { ok: accounts.revokeDevice(decodeURIComponent(revokeMatch[1])) });
    return;
  }

  json(res, 404, { error: "not found" });
}

export function createBackend(config: Config, overrides: BackendOverrides = {}): Backend {
  const db = openDb(config.dbPath);
  const accounts = new Accounts(db, config.pairTtlMs);
  const tmpDir = mkdtempSync(join(tmpdir(), "yf-desktop-"));
  const captureOnce =
    overrides.captureOnce ??
    (process.platform === "darwin" ? screencaptureCaptureOnce(tmpDir) : undefined);
  const helperPath = join(import.meta.dirname, "..", "bin", "yf-input");
  const inputSender = overrides.inputSender ?? swiftInputSender(helperPath);
  const rustdesk = overrides.rustdesk ?? new RustDeskSidecar();

  const server = createServer((req, res) => {
    void handleHttp(req, res, accounts, rustdesk).catch((e: unknown) => {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    });
  });

  const hub = new Hub(server, "/ws", {
    accounts,
    captureOnce,
    inputSender,
    defaultFps: config.fps,
  });

  const close = () =>
    new Promise<void>((resolve) => {
      hub.close();
      server.close(() => {
        db.close();
        void rustdesk.stop().finally(resolve);
      });
    });

  return { server, accounts, hub, rustdesk, config, close };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const config = loadConfig(process.argv.slice(2));
  const backend = createBackend(config);
  backend.server.listen(config.port, config.host, () => {
    const pairing = backend.accounts.rotatePairing();
    console.log(
      `YF_MOBILE_READY ${config.host} ${config.port} ${pairing.code} ${new Date(pairing.expiresAt).toISOString()}`,
    );
  });
  const shutdown = () => {
    void backend.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
