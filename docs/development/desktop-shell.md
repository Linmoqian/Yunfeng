# Yunfeng 桌面端 Tauri 外壳

桌面端在 Web UI 之外增加 Tauri 2 外壳，提供窗口、系统托盘与本地进程编排。业务逻辑仍在 `server/`，前端仍是 `app/` 的 React UI，Rust 层不承载领域逻辑。

## 职责

- 窗口：承载 `app/dist`（Vite 构建产物）。
- 托盘：`显示 Yunfeng` / `退出`；点击窗口关闭按钮时隐藏到托盘。
- 自动拉起 `yunfeng-server`：启动外壳时自动启动 Node 服务，解析 `PI_SERVER_READY` 并发出 `server-ready` 事件；退出外壳时停止服务。
- RustDesk：提供 `rustdesk_open/rustdesk_close/rustdesk_status` 三个 Tauri command，供后续桌面端远程联调接入。

## 运行

```bash
# server 准备（外壳会自动查找 dist 或 tsx）
cd server && npm install && npm run build

# 桌面端开发
cd app && npm install && npm run tauri dev
```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `YUNFENG_SERVER_PORT` | 8000 | 外壳拉起 server 时使用的端口 |
| `YUNFENG_SERVER_ENTRY` | — | 显式指定 server 入口 JS；默认优先 `server/dist/index.js`，其次 `server/node_modules/tsx` 运行 `src/index.ts` |
| `RUSTDESK_BIN` | 系统默认路径 | RustDesk 可执行文件；macOS 默认 `/Applications/RustDesk.app/Contents/MacOS/RustDesk` |

## Tauri 事件

| 事件 | 载荷 | 触发 |
| --- | --- | --- |
| `server-ready` | `{running, port}` | 解析到 `PI_SERVER_READY` |
| `server-exited` | `{pid, port, exitCode}` | server 进程退出 |
| `server-start-failed` | `string` | 找不到 server 入口或启动失败 |

## Tauri commands

| command | 返回 | 说明 |
| --- | --- | --- |
| `start_server` | `{running, port}` | 启动/复用 server |
| `stop_server` | `()` | 停止 server |
| `server_status` | `{running, port}` | 当前状态 |
| `rustdesk_open` | `{available, running, binary}` | 启动 RustDesk 进程 |
| `rustdesk_close` | `()` | 停止由外壳启动的 RustDesk 进程 |
| `rustdesk_status` | `{available, running, binary}` | RustDesk 可用性与运行状态 |

## 注意事项

- 关闭窗口不是退出：请从托盘菜单选择“退出”，以正确停止 server/RustDesk 子进程。
- `YUNFENG_SERVER_ENTRY` 指向的 server 仍以当前用户身份运行；若需要可写 HOME，请先按 server 的 `start:portable` 方式准备环境。
- RustDesk 的 ID/一次性密码管理仍由 `yunfeng-mobile-backend` 提供；外壳只负责进程启停，避免两套密码逻辑漂移。
