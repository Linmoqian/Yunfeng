// 网关进程入口：对外监听局域网地址，转发移动端请求到桌面端 Agent 服务。
// 启动协议行：YF_GATEWAY_READY <host> <port> <token> <upstream>

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { loadConfig } from "./config.js";
import { createGateway } from "./gateway.js";
import { createLogger } from "./logger.js";

/** 非回环 IPv4 地址，供启动日志提示移动端可连接的局域网地址。 */
function lanAddresses(): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && entry.internal === false) addresses.add(entry.address);
    }
  }
  return [...addresses].sort();
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`yunfeng-gateway：把桌面端 Agent API 安全暴露给局域网移动端

用法:
  node dist/index.js [--host 0.0.0.0] [--port 8787] [--upstream http://127.0.0.1:8000] [--auth-token <token>] [--cors-origin *] [--allow-all]

环境变量:
  YUNFENG_GATEWAY_HOST / PORT / UPSTREAM / TOKEN / CORS_ORIGIN / ALLOW_ALL`);
  process.exit(0);
}

const config = loadConfig(args);
const logger = createLogger();
const gateway = createGateway(config, { logger });

const server = createServer((req, res) => {
  void gateway.handle(req, res);
});

server.on("error", (error) => {
  logger.error(`[启动] 监听失败 host=${config.host} port=${config.port} error=${error.message}`);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  logger.info(`[启动] 监听 http://${config.host}:${config.port} upstream=${config.upstream}`);
  logger.info(`[启动] 局域网地址=${lanAddresses().join(",") || "未发现非回环 IPv4 地址"}`);
  logger.info(`[启动] 认证已启用 token=${config.authToken}（移动端使用 Authorization: Bearer <token>）`);
  logger.info(`[启动] 允许路径=${config.allowAll ? "/api/*" : "/api/tasks*,/api/sessions*,/api/models,/api/models-config"}`);
  // 桌面端组件读取该行获取连接参数（保持 PI_SIDECAR_READY / YF_MOBILE_READY 风格）。
  console.log(`YF_GATEWAY_READY ${config.host} ${config.port} ${config.authToken} ${config.upstream}`);
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("[启动] 收到退出信号，正在关闭");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
