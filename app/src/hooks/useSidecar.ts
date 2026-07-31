import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SidecarClient } from "../lib/api";
import type { SidecarInfo } from "../lib/types";

type Status = "idle" | "starting" | "ready" | "error";

interface UseSidecarResult {
  status: Status;
  error: string | null;
  client: SidecarClient | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useSidecar(): UseSidecarResult {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<SidecarClient | null>(null);
  const startPromise = useRef<Promise<void> | null>(null);

  const start = useCallback(async () => {
    if (startPromise.current) return startPromise.current;
    setStatus("starting");
    setError(null);
    startPromise.current = (async () => {
      const info = (await invoke("start_sidecar")) as SidecarInfo;
      const c = new SidecarClient(info.base_url, info.token);
      // 健康检查确认服务可用
      const health = await c.getHealth();
      if (!health.ok) throw new Error("sidecar health check failed");
      setClient(c);
      setStatus("ready");
    })()
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("error");
      })
      .finally(() => {
        startPromise.current = null;
      });
    return startPromise.current;
  }, []);

  const stop = useCallback(async () => {
    try {
      await invoke("stop_sidecar");
    } finally {
      setClient(null);
      setStatus("idle");
    }
  }, []);

  // 组件卸载时停止 sidecar
  useEffect(() => {
    return () => {
      void invoke("stop_sidecar").catch(() => {});
    };
  }, []);

  return { status, error, client, start, stop };
}
