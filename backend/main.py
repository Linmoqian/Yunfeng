"""Yunfeng Web 后端：FastAPI 应用入口。"""

from fastapi import FastAPI

app = FastAPI(title="Yunfeng Web API", version="0.1.0")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "fastapi", "version": "0.1.0"}
