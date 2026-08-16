# Yunfeng 桌面端（Web UI + Tauri 外壳）

- `src/`：桌面 Web UI（工作台对话 + 任务看板），Vite + React + TypeScript。
- `src-tauri/`：Tauri 2 外壳——无边框窗口、系统托盘（服务状态 + 分项快捷操作）、自动拉起 server / gateway / mobile-backend / RustDesk。

```bash
npm install
npm run dev        # 仅前端（开发服务器将 /api 代理到 http://127.0.0.1:8000）
npm run build      # 构建前端
npm run tauri dev  # 完整桌面端：前端 HMR + 后端自动编排（推荐）
```

后端依赖准备（首次，`tauri dev` 会按 dist → tsx → 源码的顺序查找入口）：

```bash
cd ../server && npm install && npm run build
cd ../gateway && npm install && npm run build
cd ../yunfeng-mobile-backend && npm install   # Node 24 直接运行 src
```

外壳环境变量、Tauri 事件与命令契约见 `docs/development/desktop-shell.md`；项目整体说明见仓库根目录 `README.md`。
