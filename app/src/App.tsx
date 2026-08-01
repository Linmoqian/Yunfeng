import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";

interface HealthResponse {
  ok: boolean;
  service: string;
  version: string;
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="App">
      <div>
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Yunfeng Web</h1>
      <div className="card">
        <p>FastAPI 后端状态：</p>
        {error ? (
          <p className="error">后端未连接：{error}</p>
        ) : health ? (
          <p className="ok">
            已连接（{health.service} v{health.version}）
          </p>
        ) : (
          <p>连接中…</p>
        )}
      </div>
      <p className="read-the-docs">vite + React + FastAPI</p>
    </div>
  );
}

export default App;
