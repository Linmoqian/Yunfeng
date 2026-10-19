# Yunfeng 桌面端 Tauri 外壳

桌面端在 Web UI 之外增加 Tauri 2 外壳，提供窗口、系统托盘与一键启动编排。Agent 任务逻辑在 Node Server 中；Rust 同时负责进程生命周期、文稿、本地协作 SQLite 和终端。数据权威见[运行架构](2026-10-15-runtime-architecture.md)。

## 职责

- 窗口：承载 `app/dist`（Vite 构建产物）。
- 托盘：`显示 Yunfeng`、Server / 网关 / 移动后端 / RustDesk 四项状态（含端口与配对码，2s 周期刷新文本与 tooltip）、分项启动/停止子菜单、`启动全部服务` / `停止全部服务`、`复制连接信息`（网关地址 + token + 配对码，走 pbcopy/clip/wl-copy 平台命令，尽力而为）、`退出`。
- 关闭窗口按钮：隐藏到托盘，不退出。
- 自动启动编排：启动外壳时按顺序拉起
  1. pi 资产播种（见下节）
  2. `yunfeng-server`（127.0.0.1:8000）
  3. `yunfeng-gateway`（127.0.0.1:8787，自动生成 token）
  4. `yunfeng-mobile-backend`（0.0.0.0:8788，自动生成配对码）
  5. RustDesk（如已安装）
- 退出外壳时停止以上所有子进程。
- 托盘菜单构建与状态同步在 `app/desktop/src-tauri/src/tray.rs`；命令包装与内部实现分离（`spawn_*_service` / `start_all_inner` 等 `pub(crate)` 函数供托盘与编排复用）。

## 运行

```bash
# 各后端准备依赖（首次，根 pnpm workspace）
pnpm install
pnpm --filter yunfeng-server build
pnpm --filter yunfeng-gateway build

# 桌面端开发 / 打包
cd app/desktop && pnpm tauri dev
```

## 原生窗口

窗口方案参考 LianAgent 的桌面壳。公共配置在 `app/desktop/src-tauri/tauri.conf.json`，macOS 在 `tauri.macos.conf.json` 覆盖整个窗口数组。调整窗口尺寸或 label 时须同步两份配置。

macOS 使用 `Overlay` 标题栏、原生红绿灯、系统圆角和阴影。前端预留控制按钮空间并提供拖拽区，双击由 Tauri 的窗口脚本切换最大化。Windows/Linux 采用无边框窗口，前端提供最小化、最大化/还原和关闭按钮，按钮位于拖拽区之外并支持键盘焦点。界面内部继续使用 Yunfeng 圆角与颜色 token。

桌面图标由现有 `maple-mark.png` 使用 `pnpm tauri icon` 生成，覆盖 ICNS、ICO、PNG 与 Windows Appx 资源。临时输出中的移动图标不迁入桌面目录。

`desktop_window::show_main` 按取消最小化、显示、聚焦的顺序恢复窗口，供启动、macOS Dock 重新打开和托盘菜单共用。关闭仍进入托盘驻留。

开发入口 `app/desktop/scripts/dev/tauri.mjs` 兼容 `pnpm tauri dev` 与 `npm run tauri dev`。macOS 的 Cargo runner 在 `target/debug/dev-bundle/` 生成临时签名的开发应用包，包含应用身份、可执行文件和图标。生成目录不入库，生产打包继续由 Tauri CLI 处理。Vite 使用严格的 5173 端口，端口占用时明确报错。

### 2026-10-13 验证

执行 `pnpm test`（29 项通过）、`pnpm build`、`cargo fmt --check`、`cargo test`（2 项通过）、`cargo clippy --all-targets`、两个开发脚本的 `node --check`，均成功。开发应用包通过 `plutil -lint` 和 `codesign --verify --deep --strict`。

macOS 原生进程已从开发应用包启动。窗口实际显示枫叶标题、自定义内容标题栏及原生红绿灯。双击后截图尺寸从 1280×800 变为 1846×1050，再次双击恢复 1280×800。实际执行标题栏拖拽、最小化按钮、关闭按钮，并读取恢复后的窗口；窗口观察工具会激活应用，因此未将这些操作认定为独立的 Dock/托盘恢复验收。直接访问 Dock 的自动化请求超时，保留手动验收：最小化或关闭窗口后点击 Dock 图标及托盘「显示 Yunfeng」，确认窗口恢复且服务继续运行。

普通 Clippy 检查保留 `lib.rs` 中已有的 `map(...).flatten()` 警告，添加 `-D warnings` 时该警告使检查失败。构建仍提示分包超过 500KB。Windows/Linux 实机按钮、键盘导航和生产安装包尚未验证。

## pi 资产播种

仓库根的 `pi-assets/` 是随产品分发的 pi agent 资产层，当前包含：

- `AGENTS.md`：工程师工作流规则，由官方 `loadProjectContextFiles` 机制注入为全局上下文；
- `extensions/sciverse/`：SciVerse 学术文献检索扩展（工具 + Skill），落入 agent dir 后被官方 loader 全局自动发现，零 npm 依赖。

外壳在每次启动全部服务前执行 `ensure_pi_assets`：

- 默认把 `services_root()/pi-assets/` 幂等播种到 agent dir（只写入缺失文件，保留已有指令和扩展）；
- AGENTS.md 对应官方 `agentDir/AGENTS.md` 全局指令位，extensions/ 对应 `agentDir/extensions/` 全局扩展目录；
- dev 与打包版本均播种到独立的 `~/.lin/agent`，不读取或复制 `~/.pi/agent`；
- `SCIVERSE_API_TOKEN` 环境变量由外壳自动透传给 server 子进程，未配置时 SciVerse 工具调用返回友好错误（见扩展 README）。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `YUNFENG_RUNTIME_HOME` | 系统 HOME | 所有 Node 子进程的可写 HOME；并自动派生 `LIN_CODING_AGENT_DIR=<home>/.lin/agent` |
| `YUNFENG_AGENT_DIR` | `<home>/.lin/agent` | 显式指定 Lin Agent 配置目录（优先于 `LIN_CODING_AGENT_DIR`） |
| `LIN_CODING_AGENT_DIR` | `<home>/.lin/agent` | Pi SDK 的 Lin 品牌配置目录；不继承 `PI_CODING_AGENT_DIR` |
| `YUNFENG_SERVER_PORT` | 8000 | server 端口 |
| `YUNFENG_SERVER_ENTRY` | — | 显式 server 入口；默认 `server/dist/index.js` |
| `YUNFENG_GATEWAY_PORT` | 8787 | 网关端口 |
| `YUNFENG_GATEWAY_TOKEN` | 自动生成 | 固定网关 token；不设置时启动自动生成并输出在日志/状态中 |
| `YUNFENG_MOBILE_BACKEND_PORT` | 8788 | 移动后端端口 |
| `YUNFENG_MOBILE_DB` | runtime home 下默认路径 | 移动后端 SQLite 路径 |
| `SCIVERSE_API_TOKEN` | — | SciVerse 扩展令牌（sci_ 开头），未设置时相关工具返回友好错误 |
| `RUSTDESK_BIN` | 系统路径 | RustDesk 可执行文件 |

## Tauri 事件

| 事件 | 载荷 | 触发 |
| --- | --- | --- |
| `server-ready` | `{running, port}` | 解析到 `PI_SERVER_READY` |
| `gateway-ready` | `{running, port, info}` | `YF_GATEWAY_READY <host> <port> <token> <upstream>` |
| `mobile-backend-ready` | `{running, port, info}` | `YF_MOBILE_READY <host> <port> <pairCode> <expiresAt>` |
| `service-exited` | `{event, pid, port, exitCode}` | 任一子进程退出 |

## Tauri commands

| command | 返回 | 说明 |
| --- | --- | --- |
| `start_all` / `stop_all` | 编排状态 / 无 | 一键启动或停止全部服务 |
| `orchestration_status` | `{server, gateway, mobileBackend, rustdesk}` | 整体状态 |
| `start_server` / `stop_server` / `server_status` | 服务状态 | server 生命周期 |
| `start_gateway` / `stop_gateway` / `gateway_status` | 服务状态 | gateway 生命周期 |
| `start_mobile_backend` / `stop_mobile_backend` / `mobile_backend_status` | 服务状态 | 移动后端生命周期 |
| `rustdesk_open` / `rustdesk_close` / `rustdesk_status` | RustDesk 状态 | RustDesk 进程启停 |

## 注意事项

- `YUNFENG_RUNTIME_HOME` 是解决系统 HOME 受保护时 `~/.lin/agent` 写入失败的关键开关；可在该 HOME 下配置独立的 `.lin/agent/models.json` 与认证，不自动迁移 Pi 的配置。
- gateway token 与 mobile-backend 配对码在每次自动生成时会打印到外壳 stdout，并通过 Tauri 事件与托盘状态暴露，请勿写入仓库。
- RustDesk 的 ID/一次性密码仍由 `yunfeng-mobile-backend` 提供；外壳只负责进程启停，避免密码逻辑漂移。
- 生产打包：`pnpm package:backends [-- --out release/yunfeng-desktop] [-- --skip-rustdesk]` 用 `pnpm deploy --prod --legacy` 产出各自包含 node_modules 的服务目录，连同 `pi-assets/` 与 RustDesk 组装到 `release/yunfeng-desktop`；Tauri App 通过 `YUNFENG_SERVICES_DIR=<out>` 定位这些服务；脚本产物不包含 App 二进制。
