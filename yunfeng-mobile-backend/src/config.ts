// CLI/env 配置解析。规则：显式 CLI 参数优先，其次环境变量，最后默认值。

import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "./types.ts";

function pick(arg: string | undefined, env: string | undefined, fallback: string): string {
  return arg ?? env ?? fallback;
}

function pickInt(
  arg: string | undefined,
  env: string | undefined,
  fallback: number,
): number {
  const raw = arg ?? env;
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

export function loadConfig(argv: string[]): Config {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith("--")) {
        args[key] = value;
        i += 1;
      }
    }
  }
  return {
    host: pick(args.host, process.env.YF_HOST, "0.0.0.0"),
    port: pickInt(args.port, process.env.YF_PORT, 8787),
    dbPath: pick(args.db, process.env.YF_DB, join(homedir(), ".yunfeng-mobile", "devices.db")),
    sidecarUrl: pick(args["sidecar-url"], process.env.YF_SIDECAR_URL, ""),
    sidecarToken: pick(args["sidecar-token"], process.env.YF_SIDECAR_TOKEN, ""),
    fps: pickInt(args.fps, process.env.YF_FPS, 2),
    pairTtlMs: pickInt(args["pair-ttl-ms"], process.env.YF_PAIR_TTL_MS, 10 * 60_000),
  };
}
