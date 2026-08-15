# yunfeng-mobile-backend

轻量移动后端（运行在电脑侧）：**配对码 + 设备 token + 内嵌 RustDesk sidecar**。

Agent 任务与对话不再经过本服务：移动端直接调用电脑侧 `yunfeng-gateway`（转发 `yunfeng-server`）的 `/api/tasks*` 接口。

远程桌面采用 RustDesk（源码固定版本 vendor/rustdesk，AGPL-3.0）：
- 本服务负责启动/停止 RustDesk 服务进程、读取 RustDesk ID、首次启动自动生成一次性连接密码；
- 移动端调用 REST 拿到 ID/密码后，通过 `rustdesk://<id>` 打开 RustDesk 官方 App 连接。

设计文档：`docs/design/yunfeng-mobile-backend.md`。

## 准备 RustDesk

```bash
npm run setup:rustdesk   # 下载官方构建产物到 bin/rustdesk（不提交仓库）
```

如需要从源码构建或审计，源码在 `vendor/rustdesk`（git submodule，固定 1.4.9）。

## 运行

```bash
npm install
npm run dev            # 默认 0.0.0.0:8788
```

启动后输出 `YF_MOBILE_READY <host> <port> <pairCode> <pairExpiresAtISO>`。

## REST API（新增）

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | /api/rustdesk/info | Bearer token | RustDesk 可用性、运行状态、ID、密码是否已配置 |
| POST | /api/rustdesk/start | Bearer token | body `{mode:"service"|"gui"}`；首次启动自动生成一次性密码并在响应中返回 `password` |
| POST | /api/rustdesk/stop | Bearer token | 停止 RustDesk 进程 |

## 验证

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test（含 RustDesk sidecar 假二进制单测）
npm run smoke       # READY、配对、WS 与远程桌面启动
```

## 调试 CLI

`node scripts/yf-cli.mjs <命令>`：

```bash
node scripts/yf-cli.mjs health http://127.0.0.1:8788
node scripts/yf-cli.mjs pair http://127.0.0.1:8788 <6位配对码> "iPhone"
node scripts/yf-cli.mjs devices http://127.0.0.1:8788
node scripts/yf-cli.mjs revoke http://127.0.0.1:8788 <deviceId>
```

自研 JPEG/输入注入 fallback 保留在 `src/desktop.ts`，当前默认不启用。
