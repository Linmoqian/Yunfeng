import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SidecarClient } from "../lib/api";
import type { SessionInfo } from "../lib/types";

interface UseSessionsResult {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  projectRoot: string | null;
  pickDirectory: () => Promise<string | null>;
  restoreProject: (root: string) => void;
  clearProject: () => void;
}

export function useSessions(client: SidecarClient | null): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (!client || refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    setError(null);
    try {
      const { sessions } = await client.listSessions();
      setSessions(sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pickDirectory = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false, title: "选择项目目录" });
    if (typeof dir === "string") {
      setProjectRoot(dir);
      return dir;
    }
    return null;
  }, []);

  const restoreProject = useCallback((root: string) => setProjectRoot(root), []);

  const clearProject = useCallback(() => setProjectRoot(null), []);

  return { sessions, loading, error, refresh, projectRoot, pickDirectory, restoreProject, clearProject };
}
