// 共享模型分组列表：按提供商分组渲染模型按钮（B/C 变体复用）。

import type { UseModelsResult } from "../hooks/useModels";

interface ModelListProps {
  prefix: "vb" | "vc";
  grouped: UseModelsResult["grouped"];
  activeModel: { id: string; provider: string } | undefined;
  disabled: boolean;
  onSelect: (provider: string, modelId: string) => Promise<void>;
}

export function ModelList({ prefix, grouped, activeModel, disabled, onSelect }: ModelListProps) {
  return (
    <>
      {grouped.map((g) => (
        <div key={g.providerId}>
          <div className={`${prefix}-model-group`}>{g.providerName}</div>
          {g.models.map((m) => (
            <button
              key={m.id}
              className={`${prefix}-model-item ${activeModel?.id === m.id ? `${prefix}-model-item-active` : ""}`}
              disabled={disabled}
              onClick={() => void onSelect(m.provider, m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
