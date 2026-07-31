import { useCallback, useEffect, useState } from "react";
import type { SidecarClient } from "../lib/api";
import type { ModelInfo, ModelsResult } from "../lib/types";

interface UseModelsResult {
  models: ModelsResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** 按提供商分组后的可用模型 */
  grouped: { providerId: string; providerName: string; configured: boolean; models: ModelInfo[] }[];
  /** 按 provider + id 查找模型（未找到返回 null） */
  findModel: (provider: string | undefined, modelId: string | undefined) => ModelInfo | null;
}

export { type UseModelsResult };

export function useModels(client: SidecarClient | null): UseModelsResult {
  const [models, setModels] = useState<ModelsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setModels(await client.getModels());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useCallback((): UseModelsResult["grouped"] => {
    if (!models) return [];
    return models.providers
      .map((p) => {
        const providerModels = models.available.filter((m) => m.provider === p.id);
        return {
          providerId: p.id,
          providerName: p.name,
          configured: p.configured,
          models: providerModels,
        };
      })
      .filter((g) => g.models.length > 0);
  }, [models]);

  const findModel = useCallback(
    (provider: string | undefined, modelId: string | undefined): ModelInfo | null => {
      if (!models || !provider || !modelId) return null;
      return models.available.find((m) => m.provider === provider && m.id === modelId) ?? null;
    },
    [models],
  );

  return { models, loading, error, refresh, grouped: grouped(), findModel };
}
