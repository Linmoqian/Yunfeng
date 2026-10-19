// 网关连接管理：设置持久化在本地，应用启动时直接读取，不再在设备内启动任何后端进程。
// 在线状态由周期健康探测 + 系统 online/offline + 页面可见性变化共同维护，
// 供全局断线横幅与自动重连使用。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GatewayClient,
  isGatewayConfigured,
  loadGatewaySettings,
  saveGatewaySettings,
  type GatewaySettings,
} from "../lib/gateway";

/** 健康探测间隔；网关侧 health 有 5s 缓存，频率无需更高。 */
const HEALTH_POLL_MS = 15_000;

export interface UseGatewayResult {
  settings: GatewaySettings;
  configured: boolean;
  client: GatewayClient | null;
  /** null=尚未探测；true/false=最近一次健康检查结果。 */
  online: boolean | null;
  testing: boolean;
  testError: string | null;
  save: (settings: GatewaySettings) => void;
  testConnection: (target?: GatewaySettings) => Promise<boolean>;
  checkOnline: () => Promise<void>;
}

export function useGateway(): UseGatewayResult {
  const [settings, setSettings] = useState<GatewaySettings>(() => loadGatewaySettings());
  const [online, setOnline] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const checking = useRef(false);

  const configured = isGatewayConfigured(settings);
  const client = useMemo(
    () => (configured ? new GatewayClient(settings.baseUrl, settings.token) : null),
    [configured, settings.baseUrl, settings.token],
  );

  const checkOnline = useCallback(async () => {
    if (checking.current) return;
    const current = loadGatewaySettings();
    if (isGatewayConfigured(current) === false) {
      setOnline(null);
      return;
    }
    checking.current = true;
    try {
      const health = await new GatewayClient(current.baseUrl, current.token).checkHealth();
      setOnline(health.ok);
    } catch {
      setOnline(false);
    } finally {
      checking.current = false;
    }
  }, []);

  const save = useCallback((next: GatewaySettings) => {
    saveGatewaySettings(next);
    setSettings({ ...next, baseUrl: next.baseUrl.trim().replace(/\/+$/, ""), token: next.token.trim() });
  }, []);

  const testConnection = useCallback(async (target: GatewaySettings = settings) => {
    if (isGatewayConfigured(target) === false) {
      setTestError("请先填写网关地址与 token");
      return false;
    }
    setTesting(true);
    setTestError(null);
    try {
      const health = await new GatewayClient(target.baseUrl, target.token).checkHealth();
      if (target.baseUrl === settings.baseUrl && target.token === settings.token) {
        setOnline(health.ok);
      }
      return health.ok;
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setTesting(false);
    }
  }, [settings]);

  // 周期探测 + 网络/可见性事件立即探测。
  useEffect(() => {
    if (!configured) return undefined;
    void checkOnline();
    const timer = window.setInterval(() => void checkOnline(), HEALTH_POLL_MS);
    const onWindowOnline = () => void checkOnline();
    const onWindowOffline = () => setOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkOnline();
    };
    window.addEventListener("online", onWindowOnline);
    window.addEventListener("offline", onWindowOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onWindowOnline);
      window.removeEventListener("offline", onWindowOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [configured, checkOnline]);

  return { settings, configured, client, online, testing, testError, save, testConnection, checkOnline };
}
