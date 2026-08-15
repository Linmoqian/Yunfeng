# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

Yunfeng Mobile 是移动端薄客户端：只做 UI 与 API 调用。Agent 任务/对话由电脑侧 `yunfeng-server + yunfeng-gateway` 提供，配对与远程桌面由电脑侧 `yunfeng-mobile-backend` 提供。主代码位于 `app/`（移动前端）与 `yunfeng-mobile-backend/`（电脑侧轻量后端）。

## 架构

```
移动端 app/src ──REST/SSE──▶ yunfeng-gateway ──▶ yunfeng-server（任务/对话/Agent，事实来源）
      └────REST/WS───▶ yunfeng-mobile-backend（配对码/设备 token + 远程桌面）
```

1. **电脑侧 yunfeng-server + yunfeng-gateway**
   - `server/` 是任务与对话的事实来源；`gateway/` 对外监听局域网（默认 `0.0.0.0:8787`），Bearer token 认证，默认只代理 `/api/tasks*`、`/api/sessions*`、`/api/models*`，并输出关键日志。
   - 移动端不启动 sidecar，不直接连接 `127.0.0.1:8000`。

2. **电脑侧 yunfeng-mobile-backend**
   - Node 24 + `ws` + `node:sqlite`；默认 `0.0.0.0:8788`。
   - 职责：配对码（6 位、10 分钟、单次）/ 设备 token（sha256 落库）/ 设备列表与吊销。
   - WebSocket `/ws`：token 认证、心跳、远程桌面 JPEG 帧推送与输入注入。
   - 不再桥接 sidecar/Agent；Agent 命令一律走网关。

3. **移动前端 `app/src/`**（React 19 + Vite + TypeScript + Tailwind v4 + shadcn）
   - `lib/gateway.ts`：`GatewayClient`，封装任务 REST、对话与 SSE 订阅（token 走 Bearer；EventSource 走 query）。
   - `hooks/`：数据层单一来源。`useGateway`（连接配置）、`useTasks`（任务列表）、`useTask`（当前任务对话/事件流）、`useModels`（模型）、`useRemoteDesktop`（配对 + 屏幕帧）。
   - `components/`：展示组件，只消费 hooks 返回值；`SettingsSheet` 配置网关/移动后端，`RemoteDesktopPanel` 查看电脑屏幕。
   - Tauri Rust 层不再管理任何子进程，只承载窗口。

## 常用命令

移动前端（`app/`）：

```bash
npm run dev          # Vite dev server（端口 1420）
npm run build        # tsc 类型检查 + vite build
npm test             # Vitest（GatewayClient 单测）
npm run tauri dev    # Tauri 窗口预览
```

移动后端（`yunfeng-mobile-backend/`）：

```bash
npm run dev          # node --watch src/index.ts，默认 0.0.0.0:8788
npm run typecheck    # tsc --noEmit
npm test             # node --test
npm run smoke        # READY/配对/WS/远程桌面端到端冒烟
npm run build:native # 编译 CGEvent 输入 helper（可选）
```

网关（`gateway/`，独立工作树 `feature/mobile-gateway`）：

```bash
npm run dev -- --auth-token <token>   # 默认 0.0.0.0:8787，转发 127.0.0.1:8000
npm test                              # node --test
```

## 关键约定与注意

- 设计语言与桌面端共用 Yunfeng Design Tokens：`docs/design/yunfeng-tokens.css`（颜色/圆角/阴影，明暗双主题）；移动端 `app/src/index.css` 只做 yf token → 旧变量/Tailwind 的兼容映射，新增样式直接使用 `--yf-*`。

- 移动端不维护任务/对话事实副本：电脑侧 server 是唯一事实来源，断线恢复依赖 SSE `Last-Event-ID`。
- 两个后端必须同时运行时：yunfeng-gateway 默认 `8787`，yunfeng-mobile-backend 默认 `8788`，避免端口冲突。
- 网关 token 与移动后端设备 token 相互独立；token 不进入仓库、不进入请求日志。
- 类型契约：移动端 `app/src/lib/types.ts` 镜像 yunfeng-server 任务 API；改动网关白名单/任务契约需同步实现、测试与文档。
- 前端单测 Vitest（`src/**/*.test.ts`）；移动后端 node --test；集成验证 `test/smoke.mjs`。
- 项目开发规则见根目录 `RULES.md`（简约/模块化/行数阈值/分层）。
- `pi/`、`pi-web/`、`matt-skills-ref/` 是本地参考仓库，不纳入提交。
