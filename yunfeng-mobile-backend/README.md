# yunfeng-mobile-backend

轻量移动后端（运行在电脑侧）：**配对码 + 设备 token + 远程桌面（JPEG 帧 + 输入注入）**。

Agent 任务与对话不再经过本服务：移动端直接调用电脑侧 `yunfeng-gateway`（转发 `yunfeng-server`）的 `/api/tasks*` 接口。

设计文档：`docs/design/yunfeng-mobile-backend.md`。

## 运行

```bash
npm install
npm run build:native   # 编译输入注入 helper（可选，远程桌面控制需要）
npm run dev            # 默认 0.0.0.0:8788
```

启动后输出 `YF_MOBILE_READY <host> <port> <pairCode> <pairExpiresAtISO>`，手机用配对码绑定后走 `/ws`。

## 验证

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test（集成用例需可监听 127.0.0.1）
npm run smoke       # 以真实入口验证 READY、配对、WS 与远程桌面启动
```

## 调试 CLI

`node scripts/yf-cli.mjs <命令>`，token 默认读 `~/.yunfeng-mobile/client.json`（`pair` 后自动保存），也可用 `--token` 指定：

```bash
node scripts/yf-cli.mjs health http://127.0.0.1:8788
node scripts/yf-cli.mjs rotate http://127.0.0.1:8788
node scripts/yf-cli.mjs pair http://127.0.0.1:8788 <6位配对码> "iPhone"
node scripts/yf-cli.mjs desktop http://127.0.0.1:8788 --fps 2 --frames 3 --save-dir /tmp/yf-frames
node scripts/yf-cli.mjs devices http://127.0.0.1:8788
node scripts/yf-cli.mjs revoke http://127.0.0.1:8788 <deviceId>
```

演示联调（无需屏幕录制权限）：`node scripts/dev-backend.mjs` 会注入演示 PNG 捕获源。
