// 远程桌面查看：配对后经移动后端 WebSocket 接收电脑屏幕帧。
// 只做展示与停止；输入注入能力保留在协议层（sendInput），UI 后续按需开放。

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopFrame, DesktopInput, PairResult } from "../lib/types";

const BACKEND_KEY = "yf-mobile-backend-url";
const TOKEN_KEY = "yf-mobile-device-token";

export interface RemoteDesktopState {
  backendUrl: string;
  token: string;
  status: "idle" | "connecting" | "running" | "error";
  frame: DesktopFrame | null;
  error: string | null;
  pair: (baseUrl: string, code: string, name?: string) => Promise<PairResult>;
  setBackendUrl: (url: string) => void;
  start: (fps?: number) => void;
  stop: () => void;
  sendInput: (input: DesktopInput) => void;
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
  const [frame, setFrame] = useState<DesktopFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

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
    if (!response.ok) {
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

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const start = useCallback((fps = 2) => {
    if (!backendUrl || !token) {
      setError("请先配置移动后端地址并完成配对");
      setStatus("error");
      return;
    }
    closeSocket();
    setError(null);
    setStatus("connecting");
    const wsUrl = `${backendUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "desktop.start", id: "start", fps }));
    };
    socket.onmessage = (message) => {
      try {
        const msg = JSON.parse(message.data as string) as Record<string, unknown>;
        if (msg.type === "rpc.response" && msg.id === "start" && msg.ok === true) {
          setStatus("running");
        } else if (msg.type === "desktop.frame") {
          setFrame(msg as unknown as DesktopFrame);
        } else if (msg.type === "desktop.stopped") {
          setStatus("idle");
        } else if (msg.type === "error") {
          setError(String(msg.message ?? "远程桌面错误"));
          setStatus("error");
        }
      } catch {
        // 忽略坏帧消息
      }
    };
    socket.onerror = () => {
      setError("远程桌面连接失败");
      setStatus("error");
    };
    socket.onclose = () => {
      setStatus((current) => (current === "running" || current === "connecting" ? "idle" : current));
    };
  }, [backendUrl, closeSocket, token]);

  const stop = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "desktop.stop", id: "stop" }));
    }
    closeSocket();
    setFrame(null);
    setStatus("idle");
  }, [closeSocket]);

  const sendInput = useCallback((input: DesktopInput) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "desktop.input", input }));
    }
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    stop();
  }, [stop]);

  useEffect(() => () => closeSocket(), [closeSocket]);

  return {
    backendUrl,
    token,
    status,
    frame,
    error,
    pair,
    setBackendUrl,
    start,
    stop,
    sendInput,
    clearToken,
  };
}
