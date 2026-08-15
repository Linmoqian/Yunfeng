// 模型目录：来自电脑侧网关 /api/models。移动端只读展示与选择，不保存模型配置。

import { useCallback, useEffect, useState } from "react";
import type { GatewayClient } from "../lib/gateway";
import type { ModelOption, ModelsData } from "../lib/types";

export interface UseModelsResult {
  models: ModelsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  options: ModelOption[];
  findModel: (provider: string | undefined, modelId: string | undefined) => ModelOption | null;
}

export function useModels(client: GatewayClient | null): UseModelsResult {
  const [models, setModels] = useState<ModelsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setModels(await client.loadModels());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const options = models?.modelList ?? [];

  const findModel = useCallback(
    (provider: string | undefined, modelId: string | undefined): ModelOption | null => {
      if (!models || !provider || !modelId) return null;
      return models.modelList.find((m) => m.provider === provider && m.id === modelId) ?? null;
    },
    [models],
  );

  return { models, loading, error, refresh, options, findModel };
}
