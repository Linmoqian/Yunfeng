// 装配：HTTP(REST) + WebSocket 服务、账号、sidecar 桥接、远程桌面、生命周期。

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
import { SidecarClient } from "./sidecar.ts";

export interface Backend {
  server: Server;
  accounts: Accounts;
  sidecar: SidecarClient;
  hub: Hub;
  config: Config;
  close: () => Promise<void>;
}

export interface BackendOverrides {
  captureOnce?: CaptureOnce;
  inputSender?: InputSender;
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
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/health") {
    const pairing = accounts.currentPairing();
    json(res, 200, {
      ok: true,
      version: 1,
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
  const sidecar = new SidecarClient(config.sidecarUrl, config.sidecarToken);
  const tmpDir = mkdtempSync(join(tmpdir(), "yf-desktop-"));
  const captureOnce =
    overrides.captureOnce ??
    (process.platform === "darwin" ? screencaptureCaptureOnce(tmpDir) : undefined);
  const helperPath = join(import.meta.dirname, "..", "bin", "yf-input");
  const inputSender = overrides.inputSender ?? swiftInputSender(helperPath);

  const server = createServer((req, res) => {
    void handleHttp(req, res, accounts).catch((e: unknown) => {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    });
  });

  const hub = new Hub(server, "/ws", {
    accounts,
    sidecar,
    captureOnce,
    inputSender,
    defaultFps: config.fps,
  });

  const close = () =>
    new Promise<void>((resolve) => {
      hub.close();
      server.close(() => {
        db.close();
        resolve();
      });
    });

  return { server, accounts, sidecar, hub, config, close };
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
