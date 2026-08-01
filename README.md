# Yunfeng Web

Pi 编码 agent 的 Web 客户端，前后端分离，后端进程内嵌 pi SDK。

## 架构

```
React 前端 (app/) ──HTTP/SSE──▶ Node 后端 (server/，进程内嵌 pi SDK)
```

- 前端：Vite + React (TypeScript)，开发服务器将 `/api` 代理到后端
- 后端：Node (TypeScript/tsx)，进程内嵌 `@earendil-works/pi-coding-agent`，复刻 pi-web 的 API 面

## 目录结构

```
app/      前端（Vite + React + TS）
server/   后端（Node 单进程，HTTP + SSE）
```

## 后端 API 面（复刻 pi-web）

| 组 | 路由 |
|---|---|
| Agent RPC | `POST /api/agent/new`、`POST/GET /api/agent/[id]`、`GET /api/agent/[id]/events`(SSE)、`GET /api/agent/running`、`GET /api/agent/running/events`(SSE) |
| Sessions | `GET /api/sessions`、`GET/PATCH/DELETE /api/sessions/[id]`、`/context`、`/state`、`/entries/[id]/thinking` |
| Models | `GET /api/models`、`GET/PUT /api/models-config` |
| Files | `GET /api/files/[...path]`（list/read/meta/download） |
| Git | `GET /api/git/status`、`/diff` |
| CWD/Home | `/cwd/browse`、`/cwd/validate`、`/default-cwd`、`/home` |
| 其他 | `/project-trust`、`/skills`、`/health` |

## 本地开发

### 后端

```bash
cd server
npm install
npm run dev        # 监听 http://127.0.0.1:8000
```

### 前端

```bash
cd app
npm install
npm run dev        # 监听 http://localhost:5173
```

访问 http://localhost:5173 ，`/api` 自动代理到后端 8000 端口。

## 说明

- 会话数据与 pi CLI 共享 `~/.pi/agent/sessions/` JSONL 文件。
- 后端需要 Node 22+；`npm install` 使用 `include=dev`（本机 npm 全局配置了 `omit=dev`）。
