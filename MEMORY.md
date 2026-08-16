# MEMORY

- 薄客户端架构：移动端 mobile-app/src 只做 UI 与 API 调用，不启动设备内后端；Agent 任务/对话经 REST/SSE 直连电脑侧 yunfeng-gateway（转发 yunfeng-server）。
- 会话/任务数据的事实来源在电脑侧 yunfeng-server；移动端不维护冲突副本，断线后按 SSE Last-Event-ID 恢复。
- yunfeng-gateway 对外监听局域网，Bearer token 认证，默认只开放 /api/tasks*、/api/sessions*、/api/models*。
- 类型契约：移动端 `mobile-app/src/lib/types.ts` 与 yunfeng-server 任务 API / yunfeng-gateway 保持边界镜像。
- 移动端与桌面端共用 Yunfeng Design Tokens（docs/design/yunfeng-tokens.css / .json / .tailwind.css）；移动端 index.css 通过兼容别名消费同一组 yf 颜色/圆角/阴影 token，主题走 [data-theme] 明暗切换。
- 移动端前端用 Vitest 覆盖 GatewayClient；后端用 node --test 覆盖账号/远程桌面。
- 项目规则维护在 `RULES.md`（简约、模块化、行数阈值、契约同步）。
- mobile-app（仓库根目录）：Tauri 2 + Vite + React + Tailwind v4 移动端薄客户端，只做 UI + API 调用（任务/对话走 gateway，远程屏幕走移动后端 WS）。
- yunfeng-mobile（仓库根目录）：早期移动端原型（含 Dashi 看板移植），已被 mobile-app 取代，仅保留参考，不再开发。
- yunfeng-mobile-backend（仓库根目录）：电脑侧轻量移动后端，Node 24 + node:sqlite；账号=配对码+设备 token（sha256 落库）；远程桌面=内嵌 RustDesk sidecar（vendor/rustdesk 固定 1.4.9，AGPL-3.0；官方二进制下载到 bin/rustdesk 不提交），首次启动返回一次性密码；自研 JPEG/CGEvent 仅作 fallback。启动输出 YF_MOBILE_READY。
- yunfeng-cli（仓库根目录）：TUI 客户端，@yunfeng/tui 组件库 + @yunfeng/cli 入口；设计 token 主题（明暗 + OSC 探测）、品牌 Header、斜杠命令与状态栏。

## 移动端补齐（2025 集成阶段）

- 推送通知为本地通知方案：Tauri 运行时走 tauri-plugin-notification，浏览器预览走 Web Notification API；未引入 APNs/FCM 等外部推送基础设施。页面隐藏时才提醒；断线期间的完成/审批事件由 SSE Last-Event-ID 补发，重连后提醒。
- 任务事件到 UI 状态的归约收敛在 mobile-app/src/lib/taskEvents.ts（纯逻辑，Vitest 覆盖）；审批卡映射在 lib/approvals.ts。
- 桌面托盘（app/src-tauri/src/tray.rs）：状态项文本与 tooltip 由 2s 周期线程刷新，菜单分项提供 server/网关/移动后端/RustDesk 启停；连接信息复制走平台剪贴板命令（pbcopy/clip/wl-copy），尽力而为。
