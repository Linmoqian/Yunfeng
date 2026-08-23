# YunFeng

云中之枫，匿于云中，而飒于林

Yunfeng 是本地优先的编码 Agent 应用：电脑侧运行 Agent 服务（内嵌 pi SDK），桌面 Web UI、移动端薄客户端与 TUI 三种前端接入同一个任务与对话数据源。事实来源在 `server/`，其余模块只做 UI、转发与进程编排。

## 仓库结构

| 目录 | 职责 |
| --- | --- |
| `app/` | 桌面端 Web UI + Tauri 2 外壳（无边框窗口、系统托盘、后端一键编排、RustDesk 进程管理） |
| `server/` | 电脑侧 Agent 服务：任务 / 对话 / 审批 / 事件流的事实来源（127.0.0.1:8000） |
| `gateway/` | 局域网 API 网关：Bearer token 认证，按最小权限把 `/api/tasks*`、`/api/sessions*`、`/api/models*` 转发给 server |
| `mobile-app/` | 移动端薄客户端：只做 UI 与 API 调用；任务 / 对话直连 gateway，远程屏幕走移动后端 |
| `yunfeng-mobile-backend/` | 电脑侧移动后端：配对码 + 设备 token 账号体系、RustDesk sidecar 远程桌面 |
| `yunfeng-cli/` | TUI 客户端：`@yunfeng/tui` 组件库 + `@yunfeng/cli` 命令入口 |
| `yunfeng-mobile/` | 早期移动端原型（已被 `mobile-app/` 取代，仅保留参考，不再开发） |
| `vendor/rustdesk` | RustDesk 源码 submodule（固定 1.4.9，AGPL-3.0，仅审计用） |
| `pi-assets/` | 随产品分发的 pi agent 资产层：AGENTS.md 工程师工作流规则 + 内置扩展（SciVerse）；桌面壳在隔离 HOME 下自动播种 |
| `scripts/` | 后端运行时打包脚本（`package-backends.mjs`） |
| `docs/` | 设计文档、开发规范与 API 契约 |

## 服务与启动协议

三个 Node 服务启动时各输出一行协议日志，前端与外壳据此取得连接参数：

| 服务 | 默认端口 | 启动输出 |
| --- | --- | --- |
| yunfeng-server | 8000 | `PI_SERVER_READY` |
| yunfeng-gateway | 0.0.0.0:8787 | `YF_GATEWAY_READY <host> <port> <token> <upstream>` |
| yunfeng-mobile-backend | 0.0.0.0:8788 | `YF_MOBILE_READY <host> <port> <pairCode> <expiresAtISO>` |

对接要点：

- 移动端凭 `YF_GATEWAY_READY` 行中的 token 调用网关：REST 走 `Authorization: Bearer`；SSE 因 EventSource 无法设置请求头，token 走 query 参数。断线后按 `Last-Event-ID` 补发，前端无需维护本地事实副本。
- 移动端凭 `YF_MOBILE_READY` 行中的 6 位配对码完成设备配对，配对后获得设备 token（sha256 落库）。
- token 与配对码均为敏感信息，只出现在启动日志、托盘状态与「复制连接信息」中，不得写入仓库。
- 类型契约镜像：`mobile-app/src/lib/types.ts` 与 server 任务 API / gateway 路径白名单保持同步；接口变更须在同一提交更新实现、测试与 `docs/api/`。

## 快速开始

```bash
# 首次：初始化 RustDesk submodule（可选，仅源码审计需要）
git submodule update --init vendor/rustdesk

# 前置：pnpm >= 9（仓库为根 pnpm workspace，yunfeng-cli 为独立内嵌 workspace）

# 方式一：桌面端（推荐，自动编排全部后端）
pnpm install
pnpm --filter yunfeng-server build
pnpm --filter yunfeng-gateway build
cd app && pnpm tauri dev
#   外壳自动拉起 pi 资产播种 + server + gateway + mobile-backend + RustDesk；
#   托盘展示各服务状态、分项启停与「复制连接信息」

# 方式二：手动分服务（后端开发时）
pnpm --filter yunfeng-server dev          # 8000
pnpm --filter yunfeng-gateway dev         # 8787，默认 upstream=http://127.0.0.1:8000
pnpm --filter yunfeng-mobile-backend dev  # 8788（Node 24）

# 移动端薄客户端（浏览器预览 / 桌面壳验证）
cd mobile-app && pnpm dev                 # Vite 预览
cd mobile-app && pnpm tauri dev           # Tauri 壳（含系统通知）

# TUI
cd yunfeng-cli && pnpm install && pnpm cli  # 交互入口；pnpm demo 为演示模式
```

移动端首次打开会自动引导配置网关地址与 token；桌面托盘「复制连接信息」可一键复制网关地址、token 与配对码。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `YUNFENG_RUNTIME_HOME` | 系统 HOME | 桌面外壳派生的可写 HOME，并派生 `PI_CODING_AGENT_DIR=<home>/.pi/agent` |
| `YUNFENG_AGENT_DIR` | 由 RUNTIME_HOME 派生 | 显式指定 pi agent 配置目录（优先） |
| `YUNFENG_SERVICES_DIR` | 仓库根目录 | 桌面外壳查找 server/gateway/mobile-backend 的根目录 |
| `YUNFENG_GATEWAY_HOST/PORT/UPSTREAM/TOKEN/ALLOW_ALL/CORS_ORIGIN` | 见 gateway 配置 | 网关监听、上游与认证配置 |
| `YF_HOST / YF_PORT / YF_DB / YF_FPS / YF_PAIR_TTL_MS` | 见 mobile-backend 配置 | 移动后端监听、数据库与配对码有效期 |
| `RUSTDESK_BIN` | 系统路径 | 显式指定 RustDesk 可执行文件 |
| `SCIVERSE_API_TOKEN` | — | SciVerse 学术检索扩展令牌，桌面壳透传给 server |

桌面外壳的完整变量、Tauri 事件与命令表见 `docs/development/desktop-shell.md`。

## 验证

| 模块 | 命令 |
| --- | --- |
| mobile-app | `pnpm --filter yunfeng-web test`（Vitest 纯逻辑）、`pnpm --filter yunfeng-web build`（tsc + Vite）、`pnpm --filter yunfeng-web run check:api`（真实 API 联通检测） |
| server | `pnpm --filter yunfeng-server test`（node --test）、`pnpm --filter yunfeng-server build`（tsc） |
| gateway | `pnpm --filter yunfeng-gateway test`（node --test） |
| yunfeng-mobile-backend | `pnpm --filter yunfeng-mobile-backend test`（node --test）、`pnpm --filter yunfeng-mobile-backend run smoke`（READY/配对/WS 联调） |
| yunfeng-cli | `cd yunfeng-cli && pnpm test`（TUI + CLI Vitest）、`pnpm smoke` |
| app 外壳 | `cd app/src-tauri && cargo fmt --check && cargo clippy && cargo test` |
| 后端打包 | `pnpm package:backends`（自包含产物，见 desktop-shell.md） |

## 文档

- 开发规范：`docs/development/`（前端 / Rust / 热加载 / 验证 / Git 工作流等）
- API 契约：`docs/api/backend-api.md`、`docs/api/gateway.md`
- 设计：`docs/design/`（移动端方案、Design Tokens）
- 项目规则与长期记忆：`RULES.md`、`MEMORY.md`、`CLAUDE.md`
