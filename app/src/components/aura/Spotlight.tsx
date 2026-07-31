// Aura ⌘K 命令面板：搜索并切换会话 / 模型，新建会话。
import { useEffect, useRef, useState } from "react";
import type { SessionInfo } from "../../lib/types";
import type { UseModelsResult } from "../../hooks/useModels";
import { Icons } from "../Icons";

interface SpotlightProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionInfo[];
  onPickSession: (s: SessionInfo) => Promise<void>;
  models: UseModelsResult["grouped"];
  activeModel: { id: string; provider: string } | undefined;
  onSelectModel: (provider: string, modelId: string) => Promise<void>;
  onNewSession: () => void;
}

export function Spotlight({
  open,
  onClose,
  sessions,
  onPickSession,
  models,
  activeModel,
  onSelectModel,
  onNewSession,
}: SpotlightProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matchedSessions = sessions
    .filter((s) => !q || (s.name || s.firstMessage || "").toLowerCase().includes(q))
    .slice(0, 8);
  const matchedModels = models
    .flatMap((g) => g.models.map((m) => ({ ...m, providerName: g.providerName })))
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q))
    .slice(0, 8);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[560px] max-w-[90vw] bg-slate-100 apple-glass rounded-2xl border border-slate-400 shadow-xl overflow-hidden">
        <div className="flex items-center px-4 border-b border-slate-200/60">
          <Icons.Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话或模型..."
            className="w-full bg-transparent px-3 py-3.5 text-sm text-slate-800 placeholder-slate-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          <kbd className="px-1.5 py-0.5 text-[11px] bg-slate-300 rounded border border-slate-400 font-pixel text-slate-600 shrink-0">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2 space-y-2 text-xs">
          {matchedSessions.length > 0 && (
            <div>
              <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider font-pixel">
                会话
              </div>
              {matchedSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onClose();
                    void onPickSession(s);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-indigo-50 text-slate-700 transition text-left"
                >
                  <span className="truncate">{s.name || s.firstMessage || "(无消息)"}</span>
                  <span className="text-[11px] text-slate-500 shrink-0 ml-2">
                    {s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? "?"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {matchedModels.length > 0 && (
            <div>
              <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider font-pixel">
                模型
              </div>
              {matchedModels.map((m) => {
                const active = activeModel?.id === m.id && activeModel?.provider === m.provider;
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    onClick={() => {
                      onClose();
                      void onSelectModel(m.provider, m.id);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-indigo-50 text-slate-700 transition text-left ${
                      active ? "text-indigo-600 font-medium" : ""
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-[11px] text-slate-500 shrink-0 ml-2">{m.providerName}</span>
                  </button>
                );
              })}
            </div>
          )}

          {matchedSessions.length === 0 && matchedModels.length === 0 && (
            <div className="px-3 py-6 text-center text-slate-500">没有匹配结果</div>
          )}

          <button
            onClick={() => {
              onClose();
              onNewSession();
            }}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl hover:bg-indigo-50 text-indigo-600 font-medium transition pixel-press"
          >
            <Icons.Plus className="w-3.5 h-3.5" />
            <span>新建会话</span>
          </button>
        </div>
      </div>
    </div>
  );
}
