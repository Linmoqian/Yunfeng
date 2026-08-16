# Yunfeng 移动端薄客户端

移动端薄客户端：**只做 UI 与 API 调用，设备内不启动任何后端进程**。

- Agent 任务 / 对话：HTTP/SSE 直连电脑侧 `yunfeng-gateway`（Bearer token；SSE 断线按 `Last-Event-ID` 自动补发）。
- 远程屏幕：WebSocket 直连电脑侧 `yunfeng-mobile-backend`（配对码 → 设备 token）。
- 推送通知：Tauri 运行时走系统通知插件，浏览器预览回退 Web Notification；任务完成 / 失败 / 待审批在页面隐藏时提醒。

## 运行

```bash
npm install
npm run dev        # 浏览器预览（Vite，1420 端口）
npm run tauri dev  # Tauri 桌面壳（用于桌面形态验证与系统通知）
npm run build      # tsc + Vite 构建
```

首次打开会引导配置网关地址与 token（取自电脑端启动日志 `YF_GATEWAY_READY <host> <port> <token> <upstream>`，或用桌面托盘「复制连接信息」）。

## 结构

```
src/
  App.tsx        装配与 hooks 调用，不持有领域业务 state
  hooks/         数据层单一来源（useGateway / useTasks / useTask / useModels / useRemoteDesktop / useNotifications）
  lib/           纯逻辑：gateway.ts（HTTP/SSE 客户端）、taskEvents.ts（事件归约）、approvals.ts、notifications.ts、types.ts（契约镜像）
  components/    展示组件，只接收 props 与 hooks 返回值
```

## 验证

```bash
npm test           # Vitest：GatewayClient、事件归约、审批映射、通知文案
npm run build      # 类型检查 + 构建
npm run check:api  # 对真实网关做 API 联通检测（需网关已启动并配置 token）
```

契约与设计见仓库根目录 `README.md`、`docs/api/gateway.md` 与 `docs/design/yunfeng-mobile-*.md`。
