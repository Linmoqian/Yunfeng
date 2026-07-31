// 模型运行时：惰性初始化单例，提供提供商/可用模型/启用模型查询。

import { ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ModelsResult, ProviderAuthStatus } from "./types";

let runtimePromise: Promise<ModelRuntime> | null = null;

export function getModelRuntime(): Promise<ModelRuntime> {
  if (!runtimePromise) {
    runtimePromise = ModelRuntime.create().catch((err: unknown) => {
      runtimePromise = null;
      throw err;
    });
  }
  return runtimePromise;
}

export async function getModels(settings: SettingsManager): Promise<ModelsResult> {
  const runtime = await getModelRuntime();
  const available = await runtime.getAvailable();

  const enabledModels = settings.getEnabledModels() ?? [];

  const providers: ProviderAuthStatus[] = [];
  for (const p of runtime.getProviders()) {
    const authCheck = await runtime.checkAuth(p.id);
    const authMethods: string[] = [];
    if (p.auth.apiKey) authMethods.push("api_key");
    if (p.auth.oauth) authMethods.push("oauth");
    providers.push({
      id: p.id,
      name: p.name,
      authMethods,
      configured: authCheck !== undefined,
    });
  }

  return {
    providers,
    available: available.map((m) => ({
      id: m.id,
      provider: m.provider,
      name: m.name,
      supportsThinking: m.reasoning === true,
    })),
    enabled: enabledModels,
    defaultProvider: settings.getDefaultProvider(),
    defaultModel: settings.getDefaultModel(),
  };
}
