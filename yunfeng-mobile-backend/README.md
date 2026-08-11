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
