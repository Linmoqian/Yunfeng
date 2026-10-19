# 项目维护要点

复审日期：2026-10-15。当前实现和 [AGENTS.md](AGENTS.md) 为依据；详细架构统一维护在[运行架构](docs/development/2026-10-15-runtime-architecture.md)。

- 根目录是 pnpm workspace，`app/cli/` 是独立 workspace。模块命令优先按目录执行，避免把移动端 `app` 包名与桌面 `yunfeng-web` 混用。
- Server 进程内使用 Pi SDK；运行时导入统一经过 `server/src/agent/sdk.ts`。配置和会话默认在 `~/.lin/agent`，项目资源在项目 `.lin`，任务和记忆在 `~/.lin`。旧 `.pi` 和 `.yunfeng` 数据不自动迁移。
- 桌面 Rust 是论文文稿和本地协作 SQLite 数据的事实来源。Server 是任务、会话、审批和记忆的事实来源。
- 桌面入口 `app/desktop/scripts/dev/tauri.mjs` 负责启动与旧实例回收；macOS 开发包位于 Cargo target 目录。复用已有实例，Rust 热重载后核对进程数量与 IPC。
- 桌面启动优先使用 Server 的 `dist/index.js`；Server 源码修改需构建和重启，前端 HMR 不会更新 Node 后端。
- `pi-assets/` 是产品分发资产，桌面只播种缺失的 Lin 文件；已有用户指令与扩展不覆盖。
- Gateway 独立启动默认监听局域网，桌面编排目前固定回环地址。移动连接之前核对实际监听地址。
- `app/mobile/` 是移动薄客户端；`app/mobile/legacy/` 是旧原型；`server-rpc/` 是实验；CLI 当前模拟普通消息，不能当作真实 Agent 接入证据。
- 历史对话与迁移报告用于追溯，记录的测试数量和旧目录不作为当前验收结论。
