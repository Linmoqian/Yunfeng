# Yunfeng 桌面端

`src/` 是 React + TypeScript + Vite 界面，使用 Ant Design Token、CSS Modules、Lucide、Motion、React Router 和 Redux Toolkit。`src-tauri/` 提供窗口、托盘、后端进程编排，以及文稿、本地协作和终端的原生能力。

## 开发

在仓库根目录准备 workspace 和后端：

```bash
pnpm install
pnpm --filter yunfeng-server build
pnpm --filter yunfeng-gateway build
```

在 `app/` 执行：

```bash
pnpm tauri dev
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

仅查看浏览器界面可执行 `pnpm dev`，`/api` 默认代理到本机 Server 的 8000 端口；Rust IPC 能力需在原生应用中验证。桌面前端当前 `pnpm test` 使用 Node 测试运行器，测试脚本以本目录 `package.json` 为准。

Server 配置默认位于 `~/.lin/agent`；Server 源码不属于 Rust 热重载范围，修改后须重新构建并重启服务。

- [开发入口与实例回收](scripts/dev/README.md)
- [桌面外壳与环境变量](../docs/development/desktop-shell.md)
- [当前运行架构](../docs/development/2026-10-15-runtime-architecture.md)
- [项目规则](../AGENTS.md)
