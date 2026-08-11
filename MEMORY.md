# MEMORY

- 三层架构：React 前端 (app/src) ─HTTP/SSE→ Bun sidecar (app/sidecar，进程内嵌入 pi SDK) ←Tauri (app/src-tauri) 只管理 sidecar 生命周期。
- 会话数据与 pi CLI 共享 `~/.pi/agent/sessions/` JSONL，sidecar 启动 agent 会读写这些文件，勿随意删改。
- sidecar HTTP 只监听 `127.0.0.1`，`X-Pi-Token` 认证；dev 用 `bun run`，release 用 `npm run bundle` 产物 `src-tauri/binaries/pi-sidecar`，可用 `BUN_PATH` 指定 bun。
- 类型契约：前端 `app/src/lib/types.ts` 与 sidecar `app/sidecar/src/types.ts` 是同一协议镜像，必须保持同步。
- 三变体 UI 原型已废弃（git 78b8aed 清空重写）；当前是单一 Apple 液态玻璃设计系统（Tailwind v4 @theme + [data-theme] CSS 变量 + shadcn），主题仍处收敛期，未锁定。
- 前端无测试框架；sidecar 验证手段是 `smoke.mjs` 集成脚本（Windows 下硬编码 bun 绝对路径）。
- 项目规则维护在 `RULES.md`（简约、模块化、行数阈值、契约同步）。
- yunfeng-mobile（仓库根目录，与 app/ 独立）：Tauri 2 + Vite + React + Tailwind v4 移动端工程，暗色 Marvis 风格首页（对话入口 / 快捷指令 / Agent 协作），前端当前用静态数据，sidecar 接入待做。
- yunfeng-mobile-backend（仓库根目录，与 app/、yunfeng-mobile/ 独立）：桌面端移动后端，Node 24 + ws + node:sqlite；账号=配对码+设备 token（sha256 落库）；通讯=WS hub 桥接 pi sidecar HTTP/SSE；远程桌面=screencapture JPEG 帧 + bin/yf-input（CGEvent 注入）；启动输出 YF_MOBILE_READY。v1 局域网直连，云端中继/WebRTC/完整账号为扩展位。
