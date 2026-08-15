# yunfeng-mobile 后端设计（账号 / 内嵌 RustDesk / 网关分工）

对标：腾讯 Marvis 的「手机 ↔ 电脑」远程协同形态。v3 决策（工程师确认）：

- 移动端保持薄客户端：只做 UI 与 API 调用，不在设备内启动任何后端进程。
- Agent 任务与对话由电脑侧 `yunfeng-server + yunfeng-gateway` 提供，移动端直连网关的 `/api/tasks*`。
- 本服务（yunfeng-mobile-backend）职责收敛为：配对码 / 设备 token / **内嵌 RustDesk sidecar**。
- 远程桌面采用 RustDesk：源码以 git submodule 固定在 `vendor/rustdesk`（1.4.9，AGPL-3.0）；官方构建产物下载到 `bin/rustdesk`（不提交）。
- 移动端连接方式：后端启动 RustDesk 服务并返回 ID 与一次性密码，移动端通过 `rustdesk://<id>` 打开官方 App。
- 自研 JPEG 帧流 / CGEvent 输入注入保留为 fallback（`src/desktop.ts` / WS `desktop.*`），默认不启用。

## 架构

```
手机 (yunfeng-mobile)
  ├─ REST/SSE ──▶ yunfeng-gateway ──▶ yunfeng-server（任务/对话/Agent，事实来源）
  └─ REST ──────▶ yunfeng-mobile-backend（本服务，电脑侧）
                     ├─ accounts : 配对码 / 设备注册 / token（node:sqlite）
                     └─ rustdesk : RustDesk sidecar 生命周期 + ID/密码
        └─ rustdesk://<id> ──▶ RustDesk 官方 App
```

- 后端运行在桌面端，监听局域网（默认 `0.0.0.0:8788`）。
- 本服务不嵌入 pi SDK，也不桥接 sidecar；Agent 相关流量全部走 yunfeng-gateway。
- 运行时可选项：Node 24；SQLite 用内置 `node:sqlite`，测试用内置 `node --test`。

## 目录

```
yunfeng-mobile-backend/
  src/
    types.ts      协议类型（账号 + WS fallback）
    config.ts     CLI/env 配置解析
    db.ts         SQLite 打开 + schema
    accounts.ts   配对码 / 设备注册 / token（sha256 落库）
    rustdesk.ts   RustDesk sidecar：启动/停止/ID/一次性密码
    desktop.ts    fallback：屏幕捕获循环 + 输入协议分发（默认关闭）
    hub.ts        WS 服务：token 认证、心跳、fallback 远程桌面路由
    index.ts      装配：HTTP + WS 服务器、生命周期
  scripts/setup-rustdesk.mjs   下载 RustDesk 官方构建产物 → bin/rustdesk
  native/RemoteInput.swift     fallback 输入注入 helper（CGEvent）
  scripts/build-native.sh      fallback helper 编译
  test/           node --test 单测与集成测试
vendor/rustdesk/ git submodule（固定 1.4.9，AGPL-3.0 源码）
```

## 配置

CLI 参数 / 环境变量：`--host`(0.0.0.0)、`--port`(8788)、`--db`(~/.yunfeng-mobile/devices.db)、
`--pair-ttl-ms`(600000)。

RustDesk 路径解析顺序：`RUSTDESK_BIN` → 本服务 `bin/rustdesk` → 系统已安装 RustDesk。
配置目录默认跟随本服务进程的 `HOME`。

启动输出一行可解析协议：

```
YF_MOBILE_READY <host> <port> <pairCode> <pairExpiresAtISO>
```

## REST API

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | /health | 无 | 服务状态 + 配对码有效期 |
| POST | /api/pair | 无 | `{code, name?}` → `{deviceId, token}`，单次使用 |
| POST | /api/pairing/rotate | 无 | 轮换配对码 |
| GET | /api/devices | Bearer token | 设备列表 |
| DELETE | /api/devices/:id | Bearer token | 吊销设备 |
| GET | /api/rustdesk/info | Bearer token | RustDesk 可用性/运行状态/ID/密码是否配置 |
| POST | /api/rustdesk/start | Bearer token | `{mode:"service"|"gui"}`；首次启动生成一次性密码并在响应返回 |
| POST | /api/rustdesk/stop | Bearer token | 停止 RustDesk |

## RustDesk 连接信息

- `start` 响应示例：`{ok:true,password:"<一次性密码>",available:true,running:true,id:"<RustDesk ID>",...}`
- `password` 只在 start 响应中出现一次；`info` 不返回密码明文。
- 密码在 RustDesk 配置文件中以 RustDesk 支持的方式保存（首次启动后由 RustDesk 转储）；移动端输入密码后连接。
- 若用户已在 RustDesk 中设置正式密码，backend 不覆盖，`start` 不再返回 password，移动端提示“密码已设置”。

## 安全边界

- 配对码即绑定能力：仅 10 分钟有效、单次使用。
- 设备 token 以 sha256 落库，原始 token 只返回一次；REST/WS 均需 token。
- RustDesk 一次性密码只返回一次，后端日志不记录密码；RustDesk 自身安全策略（ID/密码/审批模式）仍需用户确认。
- 网关 token 与移动后端设备 token 相互独立，不得复用。
- RustDesk 源码为 AGPL-3.0：当前采用“内置官方构建产物 + 独立进程”形态，未修改/链接其源码；任何源码级修改/内嵌到应用进程前需重新做许可合规评估。

## 验证

- 纯逻辑单测（accounts / config / rustdesk / desktop）：沙箱内 `node --test`。
- 集成测试（HTTP / WS / mock fallback 捕获源）：监听 127.0.0.1 后 `node --test`。
- 类型检查：`tsc --noEmit`。
- RustDesk 真实进程验证：`npm run setup:rustdesk` + start/info/stop 联调（macOS arm64 已通过）。
- 不验证项（明示）：真机深链 `rustdesk://` 跳转、RustDesk 端到端画面与输入——需真机安装 RustDesk 官方 App 验证。
