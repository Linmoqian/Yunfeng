# MEMORY

- 薄客户端架构：移动端 app/src 只做 UI 与 API 调用，不启动设备内后端；Agent 任务/对话经 REST/SSE 直连电脑侧 yunfeng-gateway（转发 yunfeng-server）。
- 会话/任务数据的事实来源在电脑侧 yunfeng-server；移动端不维护冲突副本，断线后按 SSE Last-Event-ID 恢复。
- yunfeng-gateway 对外监听局域网，Bearer token 认证，默认只开放 /api/tasks*、/api/sessions*、/api/models*。
- 类型契约：移动端 `app/src/lib/types.ts` 与 yunfeng-server 任务 API / yunfeng-gateway 保持边界镜像。
- 移动端与桌面端共用 Yunfeng Design Tokens（docs/design/yunfeng-tokens.css / .json / .tailwind.css）；移动端 index.css 通过兼容别名消费同一组 yf 颜色/圆角/阴影 token，主题走 [data-theme] 明暗切换。
- 移动端前端用 Vitest 覆盖 GatewayClient；后端用 node --test 覆盖账号/远程桌面。
- 项目规则维护在 `RULES.md`（简约、模块化、行数阈值、契约同步）。
- yunfeng-mobile（仓库根目录，与 app/ 独立）：Tauri 2 + Vite + React + Tailwind v4 移动端薄客户端，只做 UI + API 调用（任务/对话走 gateway，远程屏幕走移动后端 WS）。
- yunfeng-mobile-backend（仓库根目录）：电脑侧轻量移动后端，Node 24 + ws + node:sqlite；账号=配对码+设备 token（sha256 落库）；远程桌面=screencapture JPEG 帧 + bin/yf-input（CGEvent 注入）；不桥接 sidecar/Agent。启动输出 YF_MOBILE_READY。v1 局域网直连，云端中继/WebRTC/完整账号为扩展位。
