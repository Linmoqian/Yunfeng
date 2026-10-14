# Yunfeng

云中之枫，匿于云中，而飒于林。

Yunfeng 是本地优先的个人 Agent 工作台。桌面 React 界面通过 HTTP/SSE 访问本机 Server，Server 使用 Pi SDK 组装 Agent，并独立加载 Lin 配置。模型推理位置由模型配置决定。

## 当前结构

| 目录 | 职责与边界 |
| --- | --- |
| `app/` | React + TypeScript + Vite 桌面界面，Tauri 2 外壳；论文写作、终端和本地协作通过 Rust IPC 提供 |
| `server/` | 任务、Agent 会话、审批、事件和记忆；Pi SDK 在 Server 进程内运行 |
| `gateway/` | Bearer 认证和路径白名单，向移动端转发 Server API |
| `mobile-app/` | 移动薄客户端，任务与对话通过网关，远程屏幕通过移动后端 |
| `yunfeng-mobile-backend/` | Node 24 的设备配对、设备认证与 RustDesk 远程屏幕服务 |
| `yunfeng-cli/` | 独立 pnpm workspace 中的 TUI 组件与 CLI；当前普通消息为模拟回复，尚未连接真实 Agent |
| `server-rpc/` | Pi 子进程方案实验，未接入当前桌面启动链 |
| `yunfeng-mobile/` | 早期移动原型，仅保留参考 |
| `pi-assets/` | 分发到 Lin Agent 目录的指令与扩展资产 |
| `scripts/` | 后端打包及维护脚本 |
| `docs/` | 当前说明、接口契约、工程规范和历史记录 |
| `vendor/rustdesk/` | RustDesk 源码子模块，仅需审计源码时初始化 |

任务、会话的事实来源在 Server；文稿和本地协作数据的事实来源在 Rust SQLite。具体路径见[运行架构](docs/development/2026-10-15-runtime-architecture.md)。

首页提供开发与科研模式。科研模式面向本地项目，由决策层维护目标树、评分与预算，每轮选择一个任务交给 Pi 规划。观察、执行与反思形成闭环，等待作业或文件事件后继续，经验写入候选记忆。项目范围、执行授权与恢复规则见[科研任务契约](docs/api/2026-10-15-research-runtime.md)。

## 快速开始

根目录使用 pnpm workspace；完整后端编排需要 Node 24 及 Rust/Tauri 开发环境。

```bash
pnpm install
pnpm --filter yunfeng-server build
pnpm --filter yunfeng-gateway build
cd app
pnpm tauri dev
```

桌面入口会启动 Vite、构建 Rust，并编排后端。修改 Server 源码后需重新构建和重启该服务；桌面优先运行 `server/dist/index.js`，Vite HMR 不会替它重载。详见[桌面启动说明](app/scripts/dev/README.md)。

首次使用在 `~/.lin/agent/` 独立配置模型和认证。默认不读取 `~/.pi` 或项目 `.pi`，旧任务与凭据不自动迁移。全局与项目资源规则见 [Server README](server/README.md)。

分模块启动：

```bash
pnpm --filter yunfeng-server dev
pnpm --filter yunfeng-gateway dev
pnpm --filter yunfeng-mobile-backend dev
pnpm --dir mobile-app dev
```

独立网关默认监听 `0.0.0.0:8787`；桌面编排当前固定为 `127.0.0.1:8787`，因此桌面默认网关地址不能直接用于其他设备。移动后端默认 `0.0.0.0:8788`。启动 token 和配对码不得提交到仓库。

TUI 在独立 workspace 内运行：`cd yunfeng-cli` 后执行 `pnpm install`、`pnpm cli`。

## 验证

| 范围 | 从仓库根目录执行 |
| --- | --- |
| 文档本地链接 | `pnpm check:docs` |
| 桌面前端 | `pnpm --dir app exec tsc --noEmit`、`pnpm --dir app test` |
| Server | `pnpm --filter yunfeng-server build`、`pnpm --filter yunfeng-server test` |
| Gateway | `pnpm --filter yunfeng-gateway test` |
| 移动前端 | `pnpm --dir mobile-app test`、`pnpm --dir mobile-app build`、`pnpm --dir mobile-app check:api` |
| 移动后端 | `pnpm --filter yunfeng-mobile-backend test`、`pnpm --filter yunfeng-mobile-backend smoke` |
| Rust | 在 `app/src-tauri/` 执行 `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test` |
| TUI | 在 `yunfeng-cli/` 执行 `pnpm test`、`pnpm smoke` |

实际验证结果属于对应任务记录；命令列表不代表全部能力已经验收。

## 文档入口

- [文档索引](docs/README.md)：当前说明、契约、规范和历史设计。
- [AGENTS.md](AGENTS.md)：项目协作规则与技术约束。
- [桌面外壳](docs/development/desktop-shell.md)：环境变量、托盘和编排。
- [后端打包](scripts/package-backends.mjs)：`pnpm package:backends` 产出后端目录，不包含桌面 App 二进制。
