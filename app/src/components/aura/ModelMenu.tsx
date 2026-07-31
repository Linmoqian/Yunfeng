// Aura 模型切换下拉菜单（按提供商分组）。
import { useEffect, useRef, useState } from "react";
import type { ModelInfo } from "../../lib/types";
import type { UseModelsResult } from "../../hooks/useModels";
import { Icons } from "../Icons";

interface ModelMenuProps {
  grouped: UseModelsResult["grouped"];
  currentModel: ModelInfo | null;
  disabled: boolean;
  onSelect: (provider: string, modelId: string) => Promise<void>;
}

export function ModelMenu({ grouped, currentModel, disabled, onSelect }: ModelMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/80 text-xs font-medium text-slate-700 shadow-sm transition pixel-press"
      >
        <Icons.Cpu className="w-3.5 h-3.5 text-indigo-500" />
        <span>{currentModel ? currentModel.name : "选择模型"}</span>
        <Icons.ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-100 rounded-2xl border border-slate-200/80 shadow-2xl z-50 p-1.5 space-y-1 text-xs">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-pixel">
            选择基座 AI 模型
          </div>
          {grouped.map((g) => (
            <div key={g.providerId}>
              <div className="px-3 py-1 text-[10px] font-medium text-slate-400 font-pixel">
                {g.providerName}
                {!g.configured && "（未配置）"}
              </div>
              {g.models.map((m) => {
                const active = currentModel?.id === m.id && currentModel?.provider === m.provider;
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    disabled={disabled}
                    onClick={() => {
                      setOpen(false);
                      void onSelect(m.provider, m.id);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-medium transition text-left disabled:cursor-not-allowed ${
                      active ? "bg-indigo-50 text-indigo-600" : ""
                    }`}
                  >
                    <span className="truncate font-pixel">{m.name}</span>
                    {active && <Icons.CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="px-3 py-2 text-slate-400">没有可用模型</div>
          )}
        </div>
      )}
    </div>
  );
}
