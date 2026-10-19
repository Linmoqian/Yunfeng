import { useState, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { SessionStore } from "@/hooks/useSessionStore";
import { formatRelativeTime, searchSessions, type MobileSession } from "@/lib/sessionStore";
import { cn } from "@/lib/utils";

type Props = {
  store: SessionStore;
  onOpenSession: (id: string | null, title: string) => void;
  onNewChat: () => void;
};

export default function SessionsView({ store, onOpenSession, onNewChat }: Props) {
  const [view, setView] = useState<"all" | "archived">("all");
  const [q, setQ] = useState("");
  const [menuFor, setMenuFor] = useState<MobileSession | null>(null);
  const [renaming, setRenaming] = useState<MobileSession | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<MobileSession | null>(null);

  const list = view === "all" ? store.active : store.archived;
  const filtered = searchSessions(list, q);

  function openRename(s: MobileSession) {
    setMenuFor(null);
    setRenameDraft(s.title);
    setRenaming(s);
  }

  function confirmRename() {
    if (renaming) store.rename(renaming.id, renameDraft);
    setRenaming(null);
  }

  return (
    <div className="px-5 pb-8 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">会话</h1>
        <div className="flex items-center rounded-full border border-border bg-surface p-0.5">
          {(["all", "archived"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs transition",
                view === v ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground",
              )}
            >
              {v === "all" ? "全部" : "已归档"}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
        <Search className="size-4 shrink-0 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索会话"
          className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </label>

      <div className="mt-4 space-y-2">
        {filtered.map((s) => (
          <div key={s.id} className="group relative flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
            <button
              onClick={() => onOpenSession(s.id, s.title)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-accent">
                <MessageSquare className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{s.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.snippet}</span>
              </span>
              <span className="shrink-0 text-[11px] text-faint">{formatRelativeTime(s.updatedAt)}</span>
            </button>
            <button
              onClick={() => setMenuFor(s)}
              className="grid size-8 shrink-0 place-items-center rounded-full text-faint transition active:scale-95"
              aria-label="更多操作"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        ))}

        {filtered.length === 0 && q.trim() !== "" && (
          <p className="pt-10 text-center text-sm text-muted-foreground">没有匹配的会话</p>
        )}
        {filtered.length === 0 && q.trim() === "" && view === "all" && (
          <div className="flex flex-col items-center gap-3 pt-12 text-center">
            <p className="text-sm text-muted-foreground">暂无会话，开始第一个对话吧</p>
            <button
              onClick={onNewChat}
              className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition active:scale-95"
            >
              <Plus className="size-4" />
              新建对话
            </button>
          </div>
        )}
        {filtered.length === 0 && q.trim() === "" && view === "archived" && (
          <p className="pt-10 text-center text-sm text-muted-foreground">暂无已归档会话</p>
        )}
      </div>

      {menuFor && (
        <Sheet
          title={menuFor.title}
          onClose={() => setMenuFor(null)}
          actions={[
            { label: "重命名", icon: Pencil, onClick: () => openRename(menuFor) },
            menuFor.archived
              ? { label: "恢复", icon: ArchiveRestore, onClick: () => { store.restore(menuFor.id); setMenuFor(null); } }
              : { label: "归档", icon: Archive, onClick: () => { store.archive(menuFor.id); setMenuFor(null); } },
            { label: "删除", icon: Trash2, danger: true, onClick: () => { setConfirmDelete(menuFor); setMenuFor(null); } },
          ]}
        />
      )}

      {renaming && (
        <Modal onClose={() => setRenaming(null)}>
          <p className="text-sm font-medium">重命名会话</p>
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmRename()}
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setRenaming(null)} className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground">
              取消
            </button>
            <button
              onClick={confirmRename}
              className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground"
            >
              保存
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <p className="text-sm font-medium">删除会话？</p>
          <p className="mt-1 text-xs text-muted-foreground">
            「{confirmDelete.title}」将从列表移除，此操作不可撤销。
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground">
              取消
            </button>
            <button
              onClick={() => {
                store.remove(confirmDelete.id);
                setConfirmDelete(null);
              }}
              className="rounded-full bg-red-500 px-3.5 py-1.5 text-sm font-medium text-white"
            >
              删除
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Sheet({
  title,
  onClose,
  actions,
}: {
  title: string;
  onClose: () => void;
  actions: { label: string; icon: typeof Pencil; danger?: boolean; onClick: () => void }[];
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-[430px] rounded-t-2xl border-t border-border bg-background px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="truncate text-center text-[13px] font-medium">{title}</p>
        <div className="mt-3 space-y-1">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={a.onClick}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition active:scale-[0.98]",
                  a.danger ? "text-red-500" : "text-foreground",
                )}
              >
                <Icon className="size-4.5" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-6" onClick={onClose}>
      <div
        className="w-full max-w-[340px] rounded-2xl border border-border bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
