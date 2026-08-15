# Yunfeng 移动网关 HTTP/SSE 契约

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `GET /health`、`/api/tasks*`、`/api/sessions*`、`/api/models*`（网关代理契约） |
| 用途 | 让局域网移动端安全地查看电脑中 Agent 的任务与对话，并向 Agent 发送命令 |
| 调用方 | yunfeng-mobile 移动端应用（独立开发） |
| 提供方 | yunfeng-gateway（桌面端网关服务） |
| 稳定性 | 实验性 |
| 引入版本 | gateway 0.1.0 |
| 维护方 | 桌面端服务模块 |

- 环境：桌面电脑与移动设备处于同一局域网。
- Base URL：`http://<电脑局域网IP>:8787`（端口可用 `--port` 覆盖）。
- Method / Path：网关自身提供 `GET /health`；其余路径按反向代理规则转发。
- 认证方式：`Authorization: Bearer <token>`，或 `X-Yunfeng-Token: <token>`；SSE 因 `EventSource` 限制允许 `?token=`。
- Content-Type：网关自身响应 `application/json`；代理路径的 Content-Type 与上游响应一致（REST 为 `application/json`，事件流为 `text/event-stream`）。

## 请求

### GET /health

健康检查，唯一无需认证的接口。

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | 无请求参数 |

### 代理路径

网关不重写请求体与查询参数；请求路径、方法、请求体均转发给 `--upstream`（默认 `http://127.0.0.1:8000`）。

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/tasks` | GET | 任务列表，支持上游 `q/project/status/archived/cursor/limit` 查询参数 |
| `/api/tasks` | POST | 创建任务；body 可含 `cwd/message/model` |
| `/api/tasks/{taskId}` | GET/PATCH | 读取/重命名任务 |
| `/api/tasks/{taskId}/conversation` | GET | 读取任务对话，支持 `deferMedia/deferThinking/leafId` 查询参数 |
| `/api/tasks/{taskId}/commands` | POST | 向 Agent 发送领域命令；`{type:"prompt",message}` 用于发送消息 |
| `/api/tasks/{taskId}/events` | GET | 任务事件流（SSE），支持 `afterSeq` 与 `Last-Event-ID` 断线重连 |
| `/api/tasks/events` | GET | 全局任务摘要事件流（SSE） |
| `/api/tasks/{taskId}/interventions` 及子路径 | GET/POST | 查看与处理 Agent 审批 |
| `/api/sessions/{sessionId}` | GET | 历史会话信息与对话正文 |
| `/api/sessions/{sessionId}/context` | GET | 会话上下文（消息） |
| `/api/models`、`/api/models-config` | GET | 模型目录与配置 |

认证字段：

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `Authorization` | header | string | 否 | — | `Bearer <token>` | 与 `X-Yunfeng-Token` 二选一 |
| `X-Yunfeng-Token` | header | string | 否 | — | 非空字符串 | 与 Authorization 二选一 |
| `token` | query | string | 否 | — | 非空字符串 | 仅建议 SSE 使用；网关会剥离，不转发给上游 |

请求体上限 10 MiB，超过返回 `413`。

## 响应

### GET /health

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `ok` | boolean | 是 | `true` | 网关存活 |
| `service` | string | 是 | `yunfeng-gateway` | 服务标识 |
| `version` | string | 是 | 语义化版本 | 网关版本 |
| `auth.required` | boolean | 是 | `true` | 是否要求 token |
| `auth.header` | string | 是 | 认证头格式说明 | 展示用途 |
| `upstream.url` | string | 是 | http/https URL | 上游地址 |
| `upstream.reachable` | boolean | 是 | — | 上游最近一次探测结果（5 秒缓存） |
| `allowedPaths` | string[] | 是 | 路径模式 | 当前开放的代理路径 |

### 代理路径

成功响应状态码、响应体与上游一致。网关额外写入：

| 字段 | 位置 | 类型 | 必定返回 | 说明 |
| --- | --- | --- | --- | --- |
| `Access-Control-Allow-Origin` | header | string | 是 | `*` 或 `--cors-origin` 配置值 |
| `Access-Control-Allow-Headers` | header | string | 是 | 允许 Authorization、Content-Type、X-Yunfeng-Token、Last-Event-ID、Accept |
| `X-Forwarded-For` | 上游请求 header | string | 是 | 移动端来源 IP，供上游日志使用 |

SSE 响应保持上游 `text/event-stream` 格式，网关原样转发 `id:`、`data:` 帧与心跳，不重排顺序。

## 错误码

| 代码 | HTTP 状态 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- | --- |
| `unauthorized` | 401 | token 缺失或错误 | 否 | 使用 `YF_GATEWAY_READY` 行中的 token |
| `not_found` | 404 | 路径未开放 | 否 | 检查路径；确实需要时网关加 `--allow-all` |
| `body_too_large` | 413 | 请求体超过 10 MiB | 否 | 缩小请求体 |
| `upstream_unreachable` | 502 | 桌面端 Agent 服务不可达 | 是 | 确认 `server` 已在 `127.0.0.1:8000` 启动；指数退避，最多 3 次 |
| `gateway_error` | 500 | 网关内部错误 | 否 | 查看网关日志并反馈 |

## 权限与安全

- `/health` 公开；其余路径必须认证。认证失败一律返回 401，不区分“路径不存在”。
- token 是局域网内的完整 Agent 调用能力：默认随机生成并打印一次；固定配置后不应写入代码仓库或日志。
- 默认白名单仅任务、会话、模型接口；`/api/files*`、`/api/git*`、`/api/cwd*` 等默认不开放。
- 网关剥离认证 query 后才转发上游，避免 token 进入上游日志。
- CORS 默认 `*`；依赖 token 而不是浏览器同源策略作为安全边界。

## 行为约束

- 网关是透明代理：不修改 Agent 业务语义，重复请求的幂等性与上游接口一致。
- REST 请求无整体超时；命令类请求由上游 Agent 运行时长决定，客户端可用 Abort 取消。
- SSE 连接断开时，客户端按上游 `Last-Event-ID` 语义重连；网关会注销连接并输出关闭汇总日志。
- `/health` 上游探测结果缓存 5 秒，失败不阻断代理请求。
- 同一网关进程建议只服务一个移动端设备；多设备并发共用同一 Agent 服务的能力边界由上游决定。

## 调用示例

```bash
# 健康检查
curl http://192.168.1.10:8787/health

# 任务列表
curl -H "Authorization: Bearer <token>" http://192.168.1.10:8787/api/tasks

# 向 Agent 发送消息
curl -X POST http://192.168.1.10:8787/api/tasks/<taskId>/commands \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"type":"prompt","message":"请继续"}'

# 订阅事件流
curl -N "http://192.168.1.10:8787/api/tasks/<taskId>/events?token=<token>"
```

## 兼容性与变更记录

- `0.1.0`（实验性）：首个版本。代理路径白名单与日志格式可能随移动端联调调整；未声明兼容性保证。
- 兼容变更：新增可选代理路径、新增日志字段、新增可选响应字段。
- 不兼容变更：收紧默认白名单、变更 token 校验方式或删除代理路径前，需同步移动端接入代码。
