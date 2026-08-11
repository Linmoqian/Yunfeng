# yunfeng-mobile-backend

yunfeng-mobile 移动端后端（桌面端服务）：账号（设备绑定）、远程通讯（sidecar 桥接）、远程桌面（JPEG 流 + 输入注入）。

设计文档：`docs/design/yunfeng-mobile-backend.md`。

## 运行

```bash
npm install
npm run build:native   # 编译输入注入 helper（可选，远程桌面控制需要）
npm run dev -- --sidecar-url http://127.0.0.1:<sidecar-port> --sidecar-token <token>
```

启动后输出 `YF_MOBILE_READY <host> <port> <pairCode> <pairExpiresAtISO>`，手机用配对码绑定后走 `/ws`。

## 验证

```bash
npm run typecheck   # tsc --noEmit（需本地 node_modules 含 typescript）
npm test            # node --test（集成用例需可监听 127.0.0.1）
```

## 调试 CLI（移动端同款协议客户端）

`node scripts/yf-cli.mjs <命令>`，token 默认读 `~/.yunfeng-mobile/client.json`（`pair` 后自动保存），也可用 `--token` 指定：

```bash
node scripts/yf-cli.mjs health http://127.0.0.1:8788
node scripts/yf-cli.mjs rotate http://127.0.0.1:8788
node scripts/yf-cli.mjs pair http://127.0.0.1:8788 <6位配对码> "iPhone"
node scripts/yf-cli.mjs chat http://127.0.0.1:8788 "你好" --timeout 20
node scripts/yf-cli.mjs desktop http://127.0.0.1:8788 --fps 2 --frames 3 --save-dir /tmp/yf-frames
node scripts/yf-cli.mjs devices http://127.0.0.1:8788
node scripts/yf-cli.mjs revoke http://127.0.0.1:8788 <deviceId>
```

演示联调（无真实 pi SDK）：`node scripts/demo-sidecar.mjs`（端口 8600）+ `node scripts/dev-backend.mjs --sidecar-url http://127.0.0.1:8600 --sidecar-token demo-token`（演示捕获源返回 PNG 帧）。
