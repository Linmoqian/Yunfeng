import { useMemo, useState } from "react";
import type { UseModelsResult } from "../hooks/useModels";

interface ModelPickerProps {
  models: UseModelsResult;
  currentModel: { id: string; provider: string } | undefined;
  disabled: boolean;
  onSelect: (provider: string, modelId: string) => Promise<void>;
}

export function ModelPicker({ models, currentModel, disabled, onSelect }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const grouped = models.grouped;

  const current = useMemo(() => {
    if (!currentModel) return null;
    return (
      grouped.find((g) => g.providerId === currentModel.provider)?.models.find(
        (m) => m.id === currentModel.id,
      ) ?? null
    );
  }, [grouped, currentModel]);

  return (
    <div className="model-picker">
      <button
        className="btn btn-model"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="切换模型"
      >
        {current ? current.name : currentModel ? `${currentModel.provider}/${currentModel.id}` : "选择模型"}
      </button>
      {open && (
        <>
          <div className="model-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="model-picker-menu">
            {models.loading && <div className="model-picker-hint">加载中…</div>}
            {models.error && <div className="model-picker-hint model-picker-error">{models.error}</div>}
            {!models.loading &&
              grouped.map((g) => (
                <div key={g.providerId} className="model-group">
                  <div className="model-group-title">
                    {g.providerName}
                    {g.configured ? "" : "（未配置）"}
                  </div>
                  {g.models.map((m) => (
                    <button
                      key={`${m.provider}/${m.id}`}
                      className={`model-item ${current?.id === m.id && current?.provider === m.provider ? "model-item-active" : ""}`}
                      onClick={() => {
                        setOpen(false);
                        void onSelect(m.provider, m.id);
                      }}
                    >
                      {m.name}
                      {m.supportsThinking && <span className="model-thinking-badge">思考</span>}
                    </button>
                  ))}
                </div>
              ))}
            {!models.loading && grouped.length === 0 && (
              <div className="model-picker-hint">没有可用模型，请检查 API Key 配置</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
