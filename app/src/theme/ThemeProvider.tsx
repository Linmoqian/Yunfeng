// Ant Design 主题令牌：与 tokens.css 的 Yunfeng Design Token 同源。
// 定义在 src-tauri-less 的 CSS 变量由 global.css 导入，ConfigProvider 通过
// algorithm + token 映射这些语义，保持 Ant 组件与手写样式视觉一致。

import { ConfigProvider, theme as antdTheme, type ThemeConfig } from "antd";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  resolvedMode: "light",
  setMode: () => undefined,
});

const STORAGE_KEY = "yunfeng-theme";

function readStoredMode(): ThemeMode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function useThemeMode(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** 生成 Ant Design 主题配置。明暗由 algorithm 切换，token 映射 Yunfeng 语义。 */
export function buildAntdTheme(isDark: boolean, baseToken: Record<string, string | undefined>): ThemeConfig {
  const canvas = baseToken["--yf-bg-canvas"] ?? (isDark ? "#000000" : "#ffffff");
  const surface = baseToken["--yf-bg-surface"] ?? (isDark ? "#2c2c2e" : "#fafafc");
  const raised = baseToken["--yf-bg-elevated"] ?? (isDark ? "#333336" : "#ffffff");
  const textPrimary = baseToken["--yf-text-primary"] ?? (isDark ? "#f5f5f7" : "#1d1d1f");
  const textSecondary = baseToken["--yf-text-secondary"] ?? (isDark ? "#98989d" : "#6e6e73");
  const borderDivider = baseToken["--yf-border-divider"] ?? (isDark ? "#2c2c2e" : "#f0f0f0");
  const borderDefault = baseToken["--yf-border-default"] ?? (isDark ? "#3a3a3c" : "#d2d2d7");
  const brand = baseToken["--yf-brand-primary"] ?? (isDark ? "#2997ff" : "#0066cc");
  const error = baseToken["--yf-semantic-error"] ?? (isDark ? "#ff453a" : "#ff3b30");
  const success = baseToken["--yf-semantic-success"] ?? (isDark ? "#30d158" : "#34c759");
  const warning = baseToken["--yf-semantic-warning"] ?? (isDark ? "#ff9f0a" : "#ff9500");

  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: brand,
      colorInfo: brand,
      colorSuccess: success,
      colorError: error,
      colorWarning: warning,
      colorBgLayout: canvas,
      colorBgContainer: surface,
      colorBgElevated: raised,
      colorTextBase: textPrimary,
      colorText: textPrimary,
      colorTextSecondary: textSecondary,
      colorBorder: borderDefault,
      colorBorderSecondary: borderDivider,
      borderRadius: 8,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans CJK SC", sans-serif',
      controlHeight: 36,
    },
    components: {
      Button: {
        controlHeight: 40,
        borderRadius: 8,
      },
      Input: {
        controlHeight: 40,
        borderRadius: 8,
      },
      Select: {
        controlHeight: 36,
        borderRadius: 8,
      },
      Modal: {
        borderRadiusLG: 24,
      },
      Segmented: {
        borderRadius: 8,
        controlHeight: 32,
      },
      Tag: {
        borderRadiusSM: 5,
      },
    },
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">(() => {
    const stored = readStoredMode();
    if (stored === "light") return "light";
    if (stored === "dark") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    if (mode === "system") {
      document.documentElement.removeAttribute("data-theme");
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      document.documentElement.dataset.theme = mode;
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  }, [mode]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (mode === "system") setResolvedMode(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, [mode]);

  useEffect(() => {
    if (mode === "system") setResolvedMode(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    else setResolvedMode(mode);
  }, [mode]);

  // 读取 CSS 变量作为主题 token 的真实色彩来源，避免与 tokens.css 漂移。
  const tokens = useMemo(() => {
    const computed = getComputedStyle(document.documentElement);
    const read = (name: string): string => computed.getPropertyValue(name).trim();
    return {
      "--yf-bg-canvas": read("--yf-bg-canvas") || undefined,
      "--yf-bg-surface": read("--yf-bg-surface") || undefined,
      "--yf-bg-elevated": read("--yf-bg-elevated") || undefined,
      "--yf-text-primary": read("--yf-text-primary") || undefined,
      "--yf-text-secondary": read("--yf-text-secondary") || undefined,
      "--yf-border-divider": read("--yf-border-divider") || undefined,
      "--yf-border-default": read("--yf-border-default") || undefined,
      "--yf-brand-primary": read("--yf-brand-primary") || undefined,
      "--yf-semantic-error": read("--yf-semantic-error") || undefined,
      "--yf-semantic-success": read("--yf-semantic-success") || undefined,
      "--yf-semantic-warning": read("--yf-semantic-warning") || undefined,
    };
  }, [resolvedMode]);

  const antdConfig = useMemo(
    () => buildAntdTheme(resolvedMode === "dark", tokens),
    [resolvedMode, tokens],
  );

  const value = useMemo(() => ({ mode, resolvedMode, setMode }), [mode, resolvedMode]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={antdConfig}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}
