# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

Pi Desktop 是 pi 编码 agent 的桌面客户端（Tauri 2 应用）。核心思路：把 pi 的编码 agent 能力（会话、工具执行、流式输出）以 GUI 形式呈现。主代码位于 `app/` 目录。

## 架构：三层

```
React 前端 (app/src) ──HTTP/SSE──▶ sidecar 服务 (app/sidecar) ──进程内──▶ pi SDK (AgentSession)
      │                                    ▲
      └──── Tauri invoke ──▶ Rust (app/src-tauri) 管理 sidecar 子进程生命周期
```

1. **Rust 层 `app/src-tauri/src/lib.rs`**
   - 仅暴露两个 command：`start_sidecar` / `stop_sidecar`，负责拉起并跟踪 sidecar 子进程。
   - dev 模式用 `bun run` 运行 sidecar 源码；release 模式优先使用 `src-tauri/binaries/pi-sidecar(.exe)` 编译产物（用 `npm run bundle` 生成）。可用环境变量 `BUN_PATH` 指定 bun。
   - 等待 sidecar stdout 输出 `PI_SIDECAR_READY <port> <token>` 后返回 `{ port, token, base_url }`，超时 20 秒。

2. **sidecar 层 `app/sidecar/`**（Bun 运行，TypeScript）
   - 嵌入 `@earendil-works/pi-coding-agent`（pi SDK），进程内创建真实 `AgentSession`，是唯一能驱动 agent 的进程。
   - HTTP 服务仅监听 `127.0.0.1`，所有请求需 `X-Pi-Token` header（或 query `token`）认证。
   - 路由前缀 `/api`：`/health`、`/sessions`、`/sessions/:id/context`、`/models`、`/rpc/start`、`/rpc/:id/events`(SSE)、`/rpc/:id/command`、`/rpc/:id/destroy`、`/fs/list`、`/fs/read`。
   - `src/registry.ts`：`AgentSessionWrapper` 封装 SDK 会话 + 命令分发（prompt/abort/get_state/set_model/fork/compact/bash/steer/follow_up/get_tools 等），事件透传给 SSE。
   - `src/sessions.ts`：直接读 pi 的 JSONL 会话文件，与 pi CLI 共享 `~/.pi/agent/sessions/` 数据，无需启动 agent。列表有 30s 缓存，`invalidateSessionList()` 在 agent 事件后失效。
   - `src/fs-api.ts` / `src/models.ts`：文件浏览与模型列表。

3. **前端层 `app/src/`**（React 19 + Vite + TypeScript）
   - `App.tsx`：宿主页，统一管理数据层 hooks，通过路由 `/a` `/b` `/c` 渲染三个 UI 变体，带 motion 切换动画。
   - `lib/api.ts`：`SidecarClient`，封装全部 REST 调用与 SSE 订阅（按 `data:` 行解析、30s 心跳）。
   - `hooks/`：数据层单一来源。`useSidecar`（生命周期）、`useSessions`（会话列表）、`useSession`（当前会话：openSession/newSession/sendPrompt/abort + SSE 事件 → messages/runningTools/streamingMessage）、`useFileTree`、`useModels`。
   - `components/variants/`：三个原型变体，共享同一套 hooks 数据（`VariantProps`），只改信息架构。`src/lib/sessionActions.ts` 放跨变体复用的会话操作。
   - 类型约定以 `lib/types.ts` 为准（与 sidecar 侧 `sidecar/src/types.ts` 保持一致）。

## 常用命令

均在 `app/` 目录下执行：

```bash
npm run tauri dev        # 完整桌面应用开发（Rust + 前端 + sidecar 全链路）
npm run dev              # 仅前端 Vite dev server（端口 1420，浏览器可预览，无 Tauri 能力）
npm run build            # tsc 类型检查 + vite build（sidecar 需要时单独构建）
cd sidecar && bun run src/index.ts --port 0 --token <任意值>   # 独立运行 sidecar 便于调试
cd sidecar && npm run bundle   # bun compile 单文件二进制 → src-tauri/binaries/pi-sidecar
cd sidecar && bun test/smoke.mjs   # 临时集成测试：验证 health/sessions/models/fs 接口
```

依赖安装：前端 `npm install`；sidecar `cd sidecar && npm install`（依赖 bun，全局安装）。Rust 侧 `cargo build` 在 `src-tauri/` 下。

## 关键约定与注意

- **三变体 UI 当前处于原型阶段**（见 `TODO.md`）：`/a` 命令面板 · 极简、`/b` 工程工作台 · dock、`/c` 沉浸对话 · 抽屉。尚未收敛为正式单一 UI，改动前端时注意保持三变体共享数据层不变。
- **会话数据与 pi CLI 共享**：同一份 `~/.pi/agent/sessions/` JSONL 文件，sidecar 启动 agent 会创建/修改这些文件，勿随意删改。
- **`pi/` 与 `pi-web/` 是被 `.gitignore` 忽略的独立 git 仓库**，仅本地参考（pi 本体与 pi-web 的 RPC 设计，sidecar 的 registry 借鉴自 pi-web 的 `rpc-manager.ts`）。修改它们不会被纳入本仓库提交。
- **`matt-skills-ref/` 是独立的 skills 参考仓库**（未跟踪），含 prototype skill 方法论，三变体 UI 重构即按其指导进行。
- 前端无测试框架；sidecar 的验证手段是 `smoke.mjs` 集成脚本。改动 sidecar 协议时需同步更新前端 `lib/types.ts` 与 `SidecarClient`。
- dev 模式 sidecar 依赖全局 `bun`；Windows 下 smoke 测试脚本内硬编码了 bun 的绝对路径。
