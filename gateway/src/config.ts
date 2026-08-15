// 网关配置：CLI 参数优先，其次环境变量，最后默认值。
// 默认只暴露移动端必需的任务/会话/模型 API；--allow-all 才放开全部 /api 路径。

import { randomBytes } from "node:crypto";

export interface GatewayConfig {
  /** 对外监听地址。 */
  host: string;
  /** 对外监听端口。 */
  port: number;
  /** 桌面端 Agent 服务地址（仅本机可达）。 */
  upstream: string;
  /** 移动端调用凭证；未配置时启动阶段生成随机值。 */
  authToken: string;
  /** 是否代理全部 /api 路径（默认只代理任务/会话/模型）。 */
  allowAll: boolean;
  /** CORS 允许来源；默认 "*"。 */
  corsOrigin: string;
}

const DEFAULT_UPSTREAM = "http://127.0.0.1:8000";

function pickString(cli: string | undefined, env: string | undefined, fallback: string): string {
  const value = cli ?? env;
  return value !== undefined && value.trim() ? value.trim() : fallback;
}

function pickPort(cli: string | undefined, env: string | undefined, fallback: number): number {
  const raw = cli ?? env;
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : fallback;
}

function pickBoolean(cli: string | undefined, env: string | undefined, fallback: boolean): boolean {
  const raw = (cli ?? env)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--") === false) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value !== undefined && value.startsWith("--") === false) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function validateUpstream(upstream: string): void {
  let url: URL;
  try {
    url = new URL(upstream);
  } catch {
    throw new Error(`--upstream 不是合法 URL: ${upstream}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`--upstream 仅支持 http/https: ${upstream}`);
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new Error(`--upstream 不能包含查询参数、片段或账号信息: ${upstream}`);
  }
}

/**
 * 读取配置。未提供 token 时生成随机 token：
 * 移动端必须凭启动日志 `YF_GATEWAY_READY ...` 中的 token 才能调用代理 API。
 */
export function loadConfig(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): GatewayConfig {
  const args = parseArgs(argv);
  const upstream = pickString(
    args.upstream,
    env.YUNFENG_GATEWAY_UPSTREAM,
    DEFAULT_UPSTREAM,
  ).replace(/\/+$/, "");
  validateUpstream(upstream);

  return {
    host: pickString(args.host, env.YUNFENG_GATEWAY_HOST, "0.0.0.0"),
    port: pickPort(args.port, env.YUNFENG_GATEWAY_PORT, 8787),
    upstream,
    authToken: pickString(
      args["auth-token"],
      env.YUNFENG_GATEWAY_TOKEN,
      randomBytes(18).toString("base64url"),
    ),
    allowAll: pickBoolean(args["allow-all"], env.YUNFENG_GATEWAY_ALLOW_ALL, false),
    corsOrigin: pickString(args["cors-origin"], env.YUNFENG_GATEWAY_CORS_ORIGIN, "*"),
  };
}
