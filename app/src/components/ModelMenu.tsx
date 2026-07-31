import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Cpu } from "lucide-react";
import type { ModelInfo } from "@/lib/types";
import type { UseModelsResult } from "@/hooks/useModels";

interface ModelMenuProps {
  grouped: UseModelsResult["grouped"];
  currentModel: ModelInfo | null;
  disabled: boolean;
  onSelect: (provider: string, modelId: string) => Promise<void>;
}

export function ModelMenu({ grouped, currentModel, disabled, onSelect }: ModelMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="model-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <Cpu size={14} />
        <span>{currentModel ? currentModel.name : "选择模型"}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="model-menu">
          {grouped.map((g) => (
            <div key={g.providerId}>
              <div className="model-group-label">
                {g.providerName}
                {!g.configured && "（未配置）"}
              </div>
              {g.models.map((m) => {
                const active = currentModel?.id === m.id && currentModel?.provider === m.provider;
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    type="button"
                    className={`model-option${active ? " is-active" : ""}`}
                    onClick={() => {
                      setOpen(false);
                      void onSelect(m.provider, m.id);
                    }}
                  >
                    <span>{m.name}</span>
                    {active && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          ))}
          {grouped.length === 0 && <div className="empty-hint">没有可用模型</div>}
        </div>
      )}
    </div>
  );
}
