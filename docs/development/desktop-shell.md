# Yunfeng 桌面端 Tauri 外壳

桌面端在 Web UI 之外增加 Tauri 2 外壳，提供窗口、系统托盘与一键启动编排。业务逻辑仍在各 Node 服务中，Rust 层只负责进程生命周期。

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
- 托盘菜单构建与状态同步在 `app/src-tauri/src/tray.rs`；命令包装与内部实现分离（`spawn_*_service` / `start_all_inner` 等 `pub(crate)` 函数供托盘与编排复用）。

## 运行

```bash
# 各后端准备依赖（首次，根 pnpm workspace）
pnpm install
pnpm --filter yunfeng-server build
pnpm --filter yunfeng-gateway build

# 桌面端开发 / 打包
cd app && pnpm tauri dev
```

## pi 资产播种

仓库根的 `pi-assets/` 是随产品分发的 pi agent 资产层，当前包含：

- `AGENTS.md`：工程师工作流规则，由官方 `loadProjectContextFiles` 机制注入为全局上下文；
- `extensions/sciverse/`：SciVerse 学术文献检索扩展（工具 + Skill），落入 agent dir 后被官方 loader 全局自动发现，零 npm 依赖。

外壳在每次启动全部服务前执行 `ensure_pi_assets`：

- 仅当 `YUNFENG_RUNTIME_HOME` 或 `YUNFENG_AGENT_DIR` 生效时，把 `services_root()/pi-assets/` 幂等播种到 agent dir（内容一致则不重写，避免每启动重写文件）；
- AGENTS.md 对应官方 `agentDir/AGENTS.md` 全局指令位，extensions/ 对应 `agentDir/extensions/` 全局扩展目录；
- dev 未设置 RUNTIME_HOME 时不播种，不触碰真实 `~/.pi/agent`；
- `SCIVERSE_API_TOKEN` 环境变量由外壳自动透传给 server 子进程，未配置时 SciVerse 工具调用返回友好错误（见扩展 README）。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `YUNFENG_RUNTIME_HOME` | 系统 HOME | 所有 Node 子进程的可写 HOME；并自动派生 `PI_CODING_AGENT_DIR=<home>/.pi/agent` |
| `YUNFENG_AGENT_DIR` | 由 RUNTIME_HOME 派生 | 显式指定 pi agent 配置目录（优先） |
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

- `YUNFENG_RUNTIME_HOME` 是解决系统 HOME 受保护时 `~/.pi/agent` 写入失败的关键开关；需要把模型配置复制到该 HOME（`cp -R ~/.pi <runtime-home>/.pi`）。
- gateway token 与 mobile-backend 配对码在每次自动生成时会打印到外壳 stdout，并通过 Tauri 事件与托盘状态暴露，请勿写入仓库。
- RustDesk 的 ID/一次性密码仍由 `yunfeng-mobile-backend` 提供；外壳只负责进程启停，避免密码逻辑漂移。
- 生产打包：`pnpm package:backends [-- --out release/yunfeng-desktop] [-- --skip-rustdesk]` 用 `pnpm deploy --prod --legacy` 产出各自包含 node_modules 的服务目录，连同 `pi-assets/` 与 RustDesk 组装到 `release/yunfeng-desktop`；Tauri App 通过 `YUNFENG_SERVICES_DIR=<out>` 定位这些服务；脚本产物不包含 App 二进制。
