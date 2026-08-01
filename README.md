# Yunfeng Web

Pi 桌面客户端的 Web 版本，采用前后端分离架构。

## 技术路线

- 前端：Vite + React (TypeScript)
- 后端：FastAPI (Python)

## 目录结构

```
app/       前端（Vite + React + TS）
backend/   后端（FastAPI）
```

## 本地开发

### 后端（FastAPI）

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 前端（Vite + React）

```bash
cd app
npm install
npm run dev
```

访问 http://localhost:5173 ，开发服务器会将 `/api` 代理到后端 http://127.0.0.1:8000 。
