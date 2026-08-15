// 远程桌面：配对后调用电脑侧 yunfeng-mobile-backend 管理的内嵌 RustDesk。
// 移动端不渲染屏幕帧，而是打开 RustDesk 官方 App 连接（rustdesk://<id>）。

import { useCallback, useEffect, useRef, useState } from "react";
import type { PairResult } from "../lib/types";

const BACKEND_KEY = "yf-mobile-backend-url";
const TOKEN_KEY = "yf-mobile-device-token";

export interface RustDeskConnectionInfo {
  available: boolean;
  running: boolean;
  id: string | null;
  passwordConfigured: boolean;
  mode: "service" | "gui" | null;
  binaryPath: string | null;
  configPath: string | null;
}

export interface RemoteDesktopState {
  backendUrl: string;
  token: string;
  status: "idle" | "starting" | "running" | "error";
  info: RustDeskConnectionInfo | null;
  password: string | null;
  error: string | null;
  pair: (baseUrl: string, code: string, name?: string) => Promise<PairResult>;
  setBackendUrl: (url: string) => void;
  start: (mode?: "service" | "gui") => Promise<void>;
  stop: () => Promise<void>;
  refreshInfo: () => Promise<void>;
  openRustDeskApp: () => void;
  clearToken: () => void;
}

export function loadMobileBackendSettings(): { backendUrl: string; token: string } {
  return {
    backendUrl: (localStorage.getItem(BACKEND_KEY) ?? "").trim().replace(/\/+$/, ""),
    token: (localStorage.getItem(TOKEN_KEY) ?? "").trim(),
  };
}

export function useRemoteDesktop(): RemoteDesktopState {
  const initial = useRef(loadMobileBackendSettings()).current;
  const [backendUrl, setBackendUrlState] = useState(initial.backendUrl);
  const [token, setToken] = useState(initial.token);
  const [status, setStatus] = useState<RemoteDesktopState["status"]>("idle");
  const [info, setInfo] = useState<RustDeskConnectionInfo | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setBackendUrl = useCallback((url: string) => {
    const normalized = url.trim().replace(/\/+$/, "");
    localStorage.setItem(BACKEND_KEY, normalized);
    setBackendUrlState(normalized);
  }, []);

  const pair = useCallback(async (baseUrl: string, code: string, name?: string) => {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    const response = await fetch(`${normalized}/api/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
    });
    if (response.ok === false) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }
    const result = (await response.json()) as PairResult;
    localStorage.setItem(BACKEND_KEY, normalized);
    localStorage.setItem(TOKEN_KEY, result.token);
    setBackendUrlState(normalized);
    setToken(result.token);
    return result;
  }, []);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token],
  );

  const refreshInfo = useCallback(async () => {
    if (backendUrl === "" || token === "") return;
    const response = await fetch(`${backendUrl}/api/rustdesk/info`, {
      headers: authHeaders(),
    });
    if (response.ok === false) {
      throw new Error(`HTTP ${response.status}`);
    }
    setInfo((await response.json()) as RustDeskConnectionInfo);
  }, [authHeaders, backendUrl, token]);

  const start = useCallback(
    async (mode: "service" | "gui" = "service") => {
      if (backendUrl === "" || token === "") {
        setError("请先配置移动后端地址并完成配对");
        setStatus("error");
        return;
      }
      setStatus("starting");
      setError(null);
      try {
        const response = await fetch(`${backendUrl}/api/rustdesk/start`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ mode }),
        });
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (response.ok === false || body.ok === false) {
          throw new Error(typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
        }
        setInfo(body as unknown as RustDeskConnectionInfo);
        setPassword(typeof body.password === "string" ? body.password : null);
        setStatus(body.available === true ? "running" : "error");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [authHeaders, backendUrl, token],
  );

  const stop = useCallback(async () => {
    if (backendUrl === "" || token === "") return;
    try {
      await fetch(`${backendUrl}/api/rustdesk/stop`, {
        method: "POST",
        headers: authHeaders(),
      });
    } finally {
      setStatus("idle");
      setPassword(null);
      await refreshInfo().catch(() => {});
    }
  }, [authHeaders, backendUrl, refreshInfo, token]);

  const openRustDeskApp = useCallback(() => {
    if (info?.id) {
      // RustDesk Android 已注册 rustdesk:// 深链；无法打开时提示用户手动输入 ID。
      window.location.href = `rustdesk://${encodeURIComponent(info.id)}`;
    }
  }, [info?.id]);

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setInfo(null);
    setPassword(null);
    setStatus("idle");
  }, []);

  useEffect(() => {
    void refreshInfo().catch(() => {});
  }, [refreshInfo]);

  return {
    backendUrl,
    token,
    status,
    info,
    password,
    error,
    pair,
    setBackendUrl,
    start,
    stop,
    refreshInfo,
    openRustDeskApp,
    clearToken,
  };
}
