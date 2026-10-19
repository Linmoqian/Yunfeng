// 移动端会话管理（本地优先）：创建/重命名/归档/恢复/删除/搜索/触达。
// 真实 sidecar 会话来源接入后，可把 load/save 替换为协议调用，操作语义保持不变。

import { sessions as seedData } from "./data";

export interface MobileSession {
  id: string;
  title: string;
  snippet: string;
  updatedAt: string; // ISO
  createdAt: string; // ISO
  archived: boolean;
  messageCount: number;
}

export const SESSIONS_STORAGE_KEY = "yunfeng-sessions";

const nowIso = () => new Date().toISOString();

function seedTime(label: string): string {
  const now = Date.now();
  if (label === "刚刚") return new Date(now).toISOString();
  if (label === "10 分钟前") return new Date(now - 10 * 60_000).toISOString();
  if (label === "昨天") return new Date(now - 24 * 3600_000).toISOString();
  return new Date(now).toISOString();
}

/** 首次运行：从演示数据迁移为本地会话。 */
export function seedSessions(): MobileSession[] {
  return seedData.map((s) => ({
    id: s.id,
    title: s.title,
    snippet: s.snippet,
    updatedAt: seedTime(s.updatedAt),
    createdAt: seedTime(s.updatedAt),
    archived: false,
    messageCount: s.messages.length,
  }));
}

export function createSession(
  list: MobileSession[],
  opts: { id?: string; title: string; snippet?: string },
): MobileSession[] {
  const now = nowIso();
  const session: MobileSession = {
    id: opts.id ?? crypto.randomUUID(),
    title: opts.title,
    snippet: opts.snippet ?? "",
    updatedAt: now,
    createdAt: now,
    archived: false,
    messageCount: 1,
  };
  return [session, ...list];
}

export function renameSession(list: MobileSession[], id: string, title: string): MobileSession[] {
  const t = title.trim();
  if (!t) return list;
  return list.map((s) => (s.id === id ? { ...s, title: t, updatedAt: nowIso() } : s));
}

export function setArchived(list: MobileSession[], id: string, archived: boolean): MobileSession[] {
  return list.map((s) => (s.id === id ? { ...s, archived, updatedAt: nowIso() } : s));
}

export function deleteSession(list: MobileSession[], id: string): MobileSession[] {
  return list.filter((s) => s.id !== id);
}

export function touchSession(
  list: MobileSession[],
  id: string,
  patch: { title?: string; snippet?: string; messageCount?: number },
): MobileSession[] {
  return list.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: nowIso() } : s));
}

export function sortSessions(list: MobileSession[]): MobileSession[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function searchSessions(list: MobileSession[], query: string): MobileSession[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (s) => s.title.toLowerCase().includes(q) || s.snippet.toLowerCase().includes(q),
  );
}

/** 相对时间展示：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / 日期。 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "昨天";
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}
