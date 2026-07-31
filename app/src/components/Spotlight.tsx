import { useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { SessionInfo } from "@/lib/types";
import type { UseModelsResult } from "@/hooks/useModels";

interface SpotlightProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionInfo[];
  onPickSession: (s: SessionInfo) => void;
  models: UseModelsResult["grouped"];
  activeModel: { id: string; provider: string } | undefined;
  onSelectModel: (provider: string, modelId: string) => void;
  onNewSession: () => void;
}

/** ⌘K 命令面板：搜索并切换会话 / 模型，新建会话。 */
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
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matchedSessions = sessions
    .filter((s) => !q || (s.name || s.firstMessage || "").toLowerCase().includes(q))
    .slice(0, 6);
  const matchedModels = models
    .flatMap((g) => g.models.map((m) => ({ ...m, providerName: g.providerName })))
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q))
    .slice(0, 6);

  return (
    <div className="spotlight-backdrop" onClick={onClose}>
      <div className="spotlight" onClick={(e) => e.stopPropagation()}>
        <div className="spotlight-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话或模型…"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          <kbd className="kbd">ESC</kbd>
        </div>

        <div className="spotlight-list">
          {matchedSessions.length > 0 && (
            <div>
              <div className="spotlight-section-label">会话</div>
              {matchedSessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="spotlight-item"
                  onClick={() => {
                    onClose();
                    onPickSession(s);
                  }}
                >
                  <span>{s.name || s.firstMessage || "(无消息)"}</span>
                  <small>{s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? "?"}</small>
                </button>
              ))}
            </div>
          )}

          {matchedModels.length > 0 && (
            <div>
              <div className="spotlight-section-label">模型</div>
              {matchedModels.map((m) => {
                const active = activeModel?.id === m.id && activeModel?.provider === m.provider;
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    type="button"
                    className={`spotlight-item${active ? " is-active" : ""}`}
                    onClick={() => {
                      onClose();
                      onSelectModel(m.provider, m.id);
                    }}
                  >
                    <span>{m.name}</span>
                    <small>{m.providerName}</small>
                  </button>
                );
              })}
            </div>
          )}

          {matchedSessions.length === 0 && matchedModels.length === 0 && (
            <div className="empty-hint" style={{ textAlign: "center", padding: "24px" }}>
              没有匹配结果
            </div>
          )}

          <button
            type="button"
            className="spotlight-item"
            onClick={() => {
              onClose();
              onNewSession();
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} />
              新建会话
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
