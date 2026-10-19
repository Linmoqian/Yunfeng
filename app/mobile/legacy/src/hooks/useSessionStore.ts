// 会话存储 hook：localStorage 持久化 + CRUD 操作，供会话列表/首页/聊天使用。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SESSIONS_STORAGE_KEY,
  createSession,
  deleteSession,
  renameSession,
  seedSessions,
  setArchived,
  sortSessions,
  touchSession,
  type MobileSession,
} from "@/lib/sessionStore";

function loadStored(): MobileSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MobileSession[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // 忽略损坏数据，回退种子
  }
  return seedSessions();
}

export interface SessionStore {
  all: MobileSession[];
  active: MobileSession[];
  archived: MobileSession[];
  create: (opts: { id?: string; title: string; snippet?: string }) => void;
  rename: (id: string, title: string) => void;
  archive: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  touch: (id: string, patch: { title?: string; snippet?: string; messageCount?: number }) => void;
}

export function useSessionStore(): SessionStore {
  const [all, setAll] = useState<MobileSession[]>(loadStored);

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(all));
    } catch {
      // 存储失败不阻塞 UI
    }
  }, [all]);

  const active = useMemo(() => sortSessions(all.filter((s) => !s.archived)), [all]);
  const archived = useMemo(() => sortSessions(all.filter((s) => s.archived)), [all]);

  const create = useCallback((opts: { id?: string; title: string; snippet?: string }) => {
    setAll((list) => createSession(list, opts));
  }, []);

  const rename = useCallback((id: string, title: string) => {
    setAll((list) => renameSession(list, id, title));
  }, []);

  const archive = useCallback((id: string) => {
    setAll((list) => setArchived(list, id, true));
  }, []);

  const restore = useCallback((id: string) => {
    setAll((list) => setArchived(list, id, false));
  }, []);

  const remove = useCallback((id: string) => {
    setAll((list) => deleteSession(list, id));
  }, []);

  const touch = useCallback((id: string, patch: { title?: string; snippet?: string; messageCount?: number }) => {
    setAll((list) => touchSession(list, id, patch));
  }, []);

  return { all, active, archived, create, rename, archive, restore, remove, touch };
}
