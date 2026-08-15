// 网关核心：受 token 保护的 HTTP/SSE 反向代理。
// 移动端只与网关通信；网关把允许的 /api 请求转发给本机桌面端服务，
// 并在入口、SSE 生命周期与上游故障处输出关键日志。

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import type { GatewayConfig } from "./config.js";
import { createLogger, silentLogger, type Logger } from "./logger.js";
import { SseEventParser } from "./sse-log.js";

const SERVICE_VERSION = "0.1.0";
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const HEALTH_CACHE_MS = 5_000;

/** 逐跳头，代理两端都不能原样传递。 */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const REQUEST_DROP_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  "host",
  "content-length",
  "authorization",
  "x-yunfeng-token",
]);

const RESPONSE_DROP_HEADERS = new Set([...HOP_BY_HOP_HEADERS, "content-length"]);

function isTokenEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res: ServerResponse, status: number, data: unknown, extraHeaders?: Record<string, string>): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...(extraHeaders ?? {}),
  });
  res.end(payload);
}

function errorBody(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

function bearerToken(req: IncomingMessage, url: URL): string {
  const headerToken = req.headers["x-yunfeng-token"];
  if (typeof headerToken === "string" && headerToken) return headerToken;
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice(7);
  }
  return url.searchParams.get("token") ?? "";
}

function applyCors(res: ServerResponse, config: GatewayConfig): void {
  res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
  if (config.corsOrigin !== "*") res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Yunfeng-Token, Last-Event-ID, Accept");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type, Cache-Control");
  res.setHeader("Access-Control-Max-Age", "600");
}

/** 默认最小权限：移动端看任务/对话与选择模型所需的路由。 */
function isAllowedPath(pathname: string, config: GatewayConfig): boolean {
  if (pathname.startsWith("/api/") === false) return false;
  if (config.allowAll) return true;
  for (const prefix of ["/api/tasks", "/api/sessions"]) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return pathname === "/api/models" || pathname === "/api/models-config";
}

function filterRequestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (REQUEST_DROP_HEADERS.has(lower) || value === undefined) continue;
    headers.set(lower, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

function filterResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (RESPONSE_DROP_HEADERS.has(lower)) return;
    result[lower] = value;
  });
  return result;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error(`请求体超过 ${MAX_BODY_BYTES} 字节限制`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function sseTypeCounts(summary: ReturnType<SseEventParser["finish"]>): string {
  const entries = Object.entries(summary.typeCounts)
    .map(([type, count]) => `${type}:${count}`)
    .join(",");
  return entries || "-";
}

export interface Gateway {
  config: GatewayConfig;
  logger: Logger;
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** 主动探测上游健康状态（带 5 秒缓存）。 */
  checkUpstream(): Promise<boolean>;
}

export interface GatewayOptions {
  logger?: Logger;
}

export function createGateway(config: GatewayConfig, options: GatewayOptions = {}): Gateway {
  const logger = options.logger ?? createLogger();
  let healthCheckedAt = 0;
  let healthReachable = false;

  async function checkUpstream(): Promise<boolean> {
    const now = Date.now();
    if (now - healthCheckedAt < HEALTH_CACHE_MS) return healthReachable;
    healthCheckedAt = now;
    try {
      const response = await fetch(`${config.upstream}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      healthReachable = response.ok;
    } catch {
      healthReachable = false;
    }
    if (healthReachable === false) {
      logger.warn(`[上游] 健康检查失败 upstream=${config.upstream} 移动端请求仍会尝试转发`);
    }
    return healthReachable;
  }

  async function handleHealth(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reachable = await checkUpstream();
    json(res, 200, {
      ok: true,
      service: "yunfeng-gateway",
      version: SERVICE_VERSION,
      auth: { required: true, header: "Authorization: Bearer <token> 或 X-Yunfeng-Token" },
      upstream: { url: config.upstream, reachable },
      allowedPaths: config.allowAll
        ? ["/api/*"]
        : ["/api/tasks*", "/api/sessions*", "/api/models", "/api/models-config"],
    });
  }

  async function handleProxy(req: IncomingMessage, res: ServerResponse, localUrl: URL): Promise<void> {
    const method = req.method ?? "GET";
    const startedAt = Date.now();
    const ip = clientIp(req);

    // 去掉本地认证 query，避免把 token 传入上游。
    localUrl.searchParams.delete("token");
    const target = new URL(`${localUrl.pathname}${localUrl.search}`, config.upstream);

    let requestBytes = 0;
    let body: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      try {
        body = await readRequestBody(req);
        requestBytes = body.length;
      } catch (error) {
        json(res, 413, errorBody("body_too_large", error instanceof Error ? error.message : String(error)));
        logger.warn(`[拒绝] client=${ip} method=${method} path=${localUrl.pathname} reason=body_too_large`);
        return;
      }
    }

    const headers = filterRequestHeaders(req);
    headers.set("x-forwarded-for", ip);
    headers.set("x-forwarded-proto", "http");

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(target, {
        method,
        headers,
        ...(body ? { body } : {}),
        redirect: "follow",
      });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      logger.error(`[代理] 上游不可达 upstream=${config.upstream} method=${method} path=${localUrl.pathname} error=${cause}`);
      json(res, 502, errorBody("upstream_unreachable", "桌面端 Agent 服务不可达，请确认 server 已在 127.0.0.1 启动"));
      return;
    }

    res.writeHead(upstreamRes.status, filterResponseHeaders(upstreamRes.headers));

    if (upstreamRes.body === null) {
      res.end();
      const elapsed = Date.now() - startedAt;
      logger.info(
        `[请求] client=${ip} method=${method} path=${localUrl.pathname} auth=ok status=${upstreamRes.status} duration_ms=${elapsed} request_bytes=${requestBytes} response_bytes=0`,
      );
      return;
    }

    const isSse = (upstreamRes.headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream");
    if (isSse) {
      await pumpSse(req, res, upstreamRes, {
        startedAt,
        method,
        path: localUrl.pathname,
        ip,
      });
      return;
    }

    await pumpBody(res, upstreamRes.body, (bytes) => {
      const elapsed = Date.now() - startedAt;
      logger.info(
        `[请求] client=${ip} method=${method} path=${localUrl.pathname} auth=ok status=${upstreamRes.status} duration_ms=${elapsed} request_bytes=${requestBytes} response_bytes=${bytes}`,
      );
    });
  }

  async function pumpBody(
    res: ServerResponse,
    body: ReadableStream<Uint8Array>,
    onDone: (bytes: number) => void,
  ): Promise<void> {
    const reader = body.getReader();
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (res.writableEnded || res.destroyed) return;
        bytes += value.byteLength;
        const canContinue = res.write(Buffer.from(value));
        if (canContinue === false) await once(res, "drain");
      }
    } finally {
      if (res.writableEnded === false && res.destroyed === false) res.end();
    }
    onDone(bytes);
  }

  async function pumpSse(
    req: IncomingMessage,
    res: ServerResponse,
    upstreamRes: Response,
    meta: { startedAt: number; method: string; path: string; ip: string },
  ): Promise<void> {
    const parser = new SseEventParser();
    logger.info(`[SSE] 连接 client=${meta.ip} path=${meta.path}`);

    const reader = upstreamRes.body!.getReader();
    let bytes = 0;
    let aborted = false;
    const decoder = new TextDecoder();
    const onClose = (): void => {
      aborted = true;
      void reader.cancel().catch(() => {});
    };
    req.on("close", onClose);
    res.on("close", onClose);

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          // 冲刷 TextDecoder 内部缓冲，避免最后一帧被截断时漏计。
          parser.push(decoder.decode());
          break;
        }
        if (aborted) break;
        bytes += value.byteLength;
        if (res.writableEnded || res.destroyed) break;
        const canContinue = res.write(Buffer.from(value));
        const text = decoder.decode(value, { stream: true });
        for (const sample of parser.push(text)) {
          if (SseEventParser.isKeyEvent(sample.type)) {
            logger.info(`[SSE] 事件 path=${meta.path} type=${sample.type ?? "-"}`);
          }
        }
        if (canContinue === false) await once(res, "drain");
      }
    } catch (error) {
      logger.warn(`[SSE] 中断 path=${meta.path} error=${error instanceof Error ? error.message : String(error)}`);
    } finally {
      req.off("close", onClose);
      res.off("close", onClose);
      const summary = parser.finish();
      const elapsed = Date.now() - meta.startedAt;
      if (res.writableEnded === false && res.destroyed === false) res.end();
      logger.info(
        `[SSE] 关闭 client=${meta.ip} path=${meta.path} duration_ms=${elapsed} bytes=${bytes} events=${summary.events} key_events=${summary.keyEvents} types=${sseTypeCounts(summary)}`,
      );
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const localUrl = new URL(req.url ?? "/", "http://gateway.local");
    const method = req.method ?? "GET";
    const ip = clientIp(req);
    applyCors(res, config);

    try {
      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (method === "GET" && localUrl.pathname === "/health") {
        await handleHealth(req, res);
        return;
      }

      const token = bearerToken(req, localUrl);
      if (token === "" || isTokenEqual(token, config.authToken) === false) {
        json(res, 401, errorBody("unauthorized", "缺少或错误的访问 token"));
        logger.warn(`[拒绝] client=${ip} method=${method} path=${localUrl.pathname} reason=unauthorized`);
        return;
      }

      if (isAllowedPath(localUrl.pathname, config) === false) {
        json(res, 404, errorBody("not_found", "未开放该路径；移动端默认只能访问 /api/tasks、/api/sessions 与 /api/models"));
        logger.warn(`[拒绝] client=${ip} method=${method} path=${localUrl.pathname} reason=path_not_allowed`);
        return;
      }

      await handleProxy(req, res, localUrl);
    } catch (error) {
      logger.error(`[错误] client=${ip} method=${method} path=${localUrl.pathname} error=${error instanceof Error ? error.message : String(error)}`);
      if (res.headersSent === false) {
        json(res, 500, errorBody("gateway_error", "网关内部错误"));
      } else if (res.writableEnded === false) {
        res.end();
      }
    }
  }

  return { config, logger, handle, checkUpstream };
}

/** 测试或作为库内组件使用：不打印日志。 */
export function createQuietGateway(config: GatewayConfig): Gateway {
  return createGateway(config, { logger: silentLogger });
}
