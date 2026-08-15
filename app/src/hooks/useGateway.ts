// 网关连接管理：设置持久化在本地，应用启动时直接读取，不再在设备内启动任何后端进程。

import { useCallback, useMemo, useState } from "react";
import {
  GatewayClient,
  isGatewayConfigured,
  loadGatewaySettings,
  saveGatewaySettings,
  type GatewaySettings,
} from "../lib/gateway";

export interface UseGatewayResult {
  settings: GatewaySettings;
  configured: boolean;
  client: GatewayClient | null;
  testing: boolean;
  testError: string | null;
  save: (settings: GatewaySettings) => void;
  testConnection: () => Promise<boolean>;
}

export function useGateway(): UseGatewayResult {
  const [settings, setSettings] = useState<GatewaySettings>(() => loadGatewaySettings());
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const configured = isGatewayConfigured(settings);
  const client = useMemo(
    () => (configured ? new GatewayClient(settings.baseUrl, settings.token) : null),
    [configured, settings.baseUrl, settings.token],
  );

  const save = useCallback((next: GatewaySettings) => {
    saveGatewaySettings(next);
    setSettings({ ...next, baseUrl: next.baseUrl.trim().replace(/\/+$/, ""), token: next.token.trim() });
  }, []);

  const testConnection = useCallback(async () => {
    if (!configured) {
      setTestError("请先填写网关地址与 token");
      return false;
    }
    setTesting(true);
    setTestError(null);
    try {
      const health = await new GatewayClient(settings.baseUrl, settings.token).checkHealth();
      return health.ok;
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setTesting(false);
    }
  }, [configured, settings.baseUrl, settings.token]);

  return { settings, configured, client, testing, testError, save, testConnection };
}
