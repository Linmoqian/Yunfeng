# yunfeng-gateway

桌面端与移动端之间的 API 网关：负责对外（局域网）收发信息，对内转发到桌面端 Agent 服务。
移动端只调用网关；网关按最小权限转发 `/api/tasks*`、`/api/sessions*` 与 `/api/models*`，
并在入口、SSE 生命周期与上游故障处输出关键日志。

```
移动端 (yunfeng-mobile)
   │  HTTP/SSE + Bearer token
   ▼
yunfeng-gateway  (默认 0.0.0.0:8787)
   │  HTTP/SSE 转发（仅本机）
   ▼
yunfeng-server   (默认 127.0.0.1:8000，内嵌 pi Agent)
```

## 快速开始

```bash
# 1. 桌面端先启动 Agent 服务
cd ../server && npm run dev

# 2. 再启动网关（固定 token，便于移动端配置）
cd ../gateway && npm install && npm run dev -- --auth-token your-token

# 3. 从日志读取启动协议行
# YF_GATEWAY_READY 0.0.0.0 8787 your-token http://127.0.0.1:8000
```

未提供 `--auth-token` 时会生成随机 token 并打印在 `YF_GATEWAY_READY` 行；
生产使用建议通过 `YUNFENG_GATEWAY_TOKEN` 固定。

## 配置

CLI 参数优先，其次环境变量，最后默认值。

| CLI | 环境变量 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `--host` | `YUNFENG_GATEWAY_HOST` | `0.0.0.0` | 对外监听地址；仅本机调试可改 `127.0.0.1` |
| `--port` | `YUNFENG_GATEWAY_PORT` | `8787` | 对外监听端口 |
| `--upstream` | `YUNFENG_GATEWAY_UPSTREAM` | `http://127.0.0.1:8000` | 桌面端 Agent 服务地址 |
| `--auth-token` | `YUNFENG_GATEWAY_TOKEN` | 随机生成 | 移动端访问凭证 |
| `--cors-origin` | `YUNFENG_GATEWAY_CORS_ORIGIN` | `*` | CORS 允许来源 |
| `--allow-all` | `YUNFENG_GATEWAY_ALLOW_ALL` | `false` | 是否放开全部 `/api/*` |

## 移动端接入

Base URL 使用电脑局域网地址，例如 `http://192.168.1.10:8787`。

```ts
const GATEWAY = "http://192.168.1.10:8787";
const TOKEN = "<YF_GATEWAY_READY 行中的 token>";

// 任务列表（看到 Agent 任务）
const tasks = await fetch(`${GATEWAY}/api/tasks`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
}).then((r) => r.json());

// 任务对话（看到任务内的完整对话）
const conversation = await fetch(
  `${GATEWAY}/api/tasks/${encodeURIComponent(taskId)}/conversation?deferMedia`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
).then((r) => r.json());

// 给 Agent 发消息（prompt 会转发到电脑中的 Agent）
await fetch(`${GATEWAY}/api/tasks/${encodeURIComponent(taskId)}/commands`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "prompt", message: "继续执行" }),
});

// 订阅任务事件流。EventSource 不能设置请求头，token 走 query。
const events = new EventSource(
  `${GATEWAY}/api/tasks/${encodeURIComponent(taskId)}/events?token=${encodeURIComponent(TOKEN)}`,
);
events.onmessage = (event) => console.log(JSON.parse(event.data));
```

## 关键日志

服务端输出稳定、可检索的单行日志，前缀 `[gateway] <ISO时间> [级别]`。

| 日志 | 触发时机 |
| --- | --- |
| `[启动] 监听 ...` | 网关监听成功 |
| `[启动] 局域网地址=...` | 移动端可连接的电脑 IPv4 地址 |
| `YF_GATEWAY_READY <host> <port> <token> <upstream>` | 启动协议行，供桌面端/移动端解析 |
| `[请求] client= method= path= auth=ok status= duration_ms= request_bytes= response_bytes=` | 每个 REST 转发完成 |
| `[SSE] 连接 / 事件 / 关闭` | SSE 连接生命周期、关键 Agent 事件、断线汇总 |
| `[拒绝] reason=unauthorized / path_not_allowed / body_too_large` | 认证失败或路径未开放 |
| `[代理] 上游不可达 ...` | 桌面端服务未启动或不可用 |
| `[上游] 健康检查失败 ...` | `/health` 探测失败 |

## 安全边界

- 网关只转发移动端所需的 `/api/tasks*`、`/api/sessions*`、`/api/models*`；需要其他路径时显式 `--allow-all`。
- 所有代理请求必须携带 Bearer token；`/health` 公开。token 是局域网内的完整调用能力，请妥善保管。
- 认证 query 会被网关剥离，不会传入上游；请求/转发日志不记录请求体与 token，token 仅在启动阶段打印一次。
- 网关本身不实现配对码/设备注册，配对流程属于移动端后端职责，可在合并后叠加。

## 验证

```bash
npm test        # node:test + mock 上游集成测试
npm run build   # tsc 类型检查与构建
```
