# yunfeng-mobile 后端设计（账号 / 远程桌面 / 网关分工）

对标：腾讯 Marvis 的「手机 ↔ 电脑」远程协同形态。v2 决策（工程师确认）：

- 移动端保持薄客户端：只做 UI 与 API 调用，不在设备内启动任何后端进程。
- Agent 任务与对话由电脑侧 `yunfeng-server + yunfeng-gateway` 提供，移动端直连网关的 `/api/tasks*`。
- 本服务（yunfeng-mobile-backend）职责收敛为：配对码 / 设备 token / WebSocket 远程桌面。
- 1A 部署拓扑：局域网直连，手机与桌面同一 Wi-Fi，配对码绑定；协议预留云端中继扩展位。
- 2A 远程桌面传输：WebSocket + JPEG 帧；WebRTC 作为后续升级位。
- 3A 账号形态：轻量设备绑定（配对码 + 设备注册 + token），无邮箱 / 密码体系。

## 架构

```
手机 (yunfeng-mobile)
  ├─ REST/SSE ──▶ yunfeng-gateway ──▶ yunfeng-server（任务/对话/Agent，事实来源）
  └─ REST/WS ──▶ yunfeng-mobile-backend（本服务，电脑侧）
                     ├─ accounts : 配对码 / 设备注册 / token（node:sqlite）
                     ├─ hub      : WebSocket 连接认证与消息路由
                     └─ desktop  : 屏幕捕获 JPEG 帧 / 输入注入
```

- 后端运行在桌面端，监听局域网（默认 `0.0.0.0:8788`）。
- 本服务不嵌入 pi SDK，也不桥接 sidecar；Agent 相关流量全部走 yunfeng-gateway。
- 运行时可选项：Node 24；WS 服务端依赖 `ws`，SQLite 用内置 `node:sqlite`，测试用内置 `node --test`。

## 目录

```
yunfeng-mobile-backend/
  src/
    types.ts      协议类型（账号 + 远程桌面 + WS 消息）
    config.ts     CLI/env 配置解析
    db.ts         SQLite 打开 + schema
    accounts.ts   配对码 / 设备注册 / token（sha256 落库）
    desktop.ts    屏幕捕获循环 + 输入协议分发（捕获源 / 输入器可注入）
    hub.ts        WS 服务：token 认证、心跳、远程桌面消息路由
    index.ts      装配：HTTP + WS 服务器、生命周期
  native/RemoteInput.swift   输入注入 helper（CGEvent）
  scripts/build-native.sh    swiftc 编译输入 helper → bin/yf-input
  scripts/dev-backend.mjs    演示捕获源（PNG 帧，无需屏幕录制权限）
  scripts/yf-cli.mjs         配对 / 设备 / 远程桌面调试 CLI
  test/           node --test 单测与集成测试
```

## 配置

CLI 参数 / 环境变量：`--host`(0.0.0.0)、`--port`(8788)、`--db`(~/.yunfeng-mobile/devices.db)、
`--fps`(2)、`--pair-ttl-ms`(600000)。

启动输出一行可解析协议（对齐 `PI_SERVER_READY` / `YF_GATEWAY_READY` 风格）：

```
YF_MOBILE_READY <host> <port> <pairCode> <pairExpiresAtISO>
```

## REST API

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | /health | 无 | 服务状态 + 配对码有效期 |
| POST | /api/pair | 无 | `{code, name?}` → `{deviceId, token}`，单次使用 |
| POST | /api/pairing/rotate | 无 | 轮换配对码（局域网内码即能力，风险见安全） |
| GET | /api/devices | Bearer token | 设备列表 |
| DELETE | /api/devices/:id | Bearer token | 吊销设备 |

## WS 协议（/ws?token=... 或 Bearer）

客户端 → 服务端：

```
{type:"ping", id?}
{type:"desktop.start", id, fps?}
{type:"desktop.stop", id}
{type:"desktop.input", id?, input:{kind:"move"|"click"|"scroll"|"key", ...}}
```

服务端 → 客户端：

```
{type:"pong", id?}
{type:"rpc.response", id, ok:true, data?} | {id, ok:false, error}
{type:"desktop.frame", seq, mime:"image/jpeg", data:"<base64>"}
{type:"desktop.stopped", reason?}
{type:"error", id?, message}
```

> `rpc.response` 保留原协议类型名，仅作为桌面启动/输入等请求的应答信封，不再承担 Agent RPC 语义。

## 远程桌面

- 捕获：macOS `screencapture -x -t jpg` 子进程按 `fps` 间隔截图 → JPEG → WS 推送；默认 2fps。
  捕获源抽象为可注入函数，后续可替换为 CGDisplayStream / WebRTC。
- 输入：协议 `desktop.input` → 解析为 CGEvent 参数 → 调用 `bin/yf-input`（Swift，CGEventPost）。
  helper 未编译时返回 `unsupported`（明确报错，不静默）。
- 权限：macOS 屏幕录制 + 辅助功能权限；未授权时运行结果不在沙箱内验证（边界见验证）。

## 安全边界

- 配对码即绑定能力：仅 10 分钟有效、单次使用；轮换接口仅限局域网，文档明示风险。
- 设备 token 以 sha256 落库，原始 token 只返回一次；WS/REST 均需 token。
- 网关 token 与移动后端设备 token 相互独立，不得复用；网关侧最小白名单为任务/会话/模型。
- 仅作 v1 本地工具：不部署云端、不多用户；中继/WebRTC/完整账号为后续扩展位。

## 验证

- 纯逻辑单测（accounts / config / desktop）：沙箱内 `node --test`。
- 集成测试（HTTP / WS / mock 捕获源与输入器）：监听 127.0.0.1 后 `node --test`。
- 类型检查：`tsc --noEmit`。
- 不验证项（明示）：真实屏幕捕获帧率、输入注入、真机 Tauri 端到端——需本机权限与真机。
