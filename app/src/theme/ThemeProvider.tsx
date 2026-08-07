// Ant Design 主题令牌：与 tokens.css 的 CSS 变量同源（暖色丝缎系）。
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

/** 生成 Ant Design 主题配置。明暗由 algorithm 切换，token 映射暖色丝缎系语义。 */
export function buildAntdTheme(isDark: boolean, baseToken: Record<string, string | undefined>): ThemeConfig {
  const canvas = baseToken["--canvas"] ?? (isDark ? "#171a18" : "#f2f3ef");
  const surface = baseToken["--surface"] ?? (isDark ? "#20231f" : "#fbfaf6");
  const raised = baseToken["--surface-raised"] ?? (isDark ? "#292c27" : "#fffdf9");
  const textPrimary = baseToken["--text-primary"] ?? (isDark ? "#f2efe7" : "#292720");
  const textSecondary = baseToken["--text-secondary"] ?? (isDark ? "#b8b6ac" : "#67675f");
  const borderSubtle = baseToken["--border-subtle"] ?? (isDark ? "#3a3e37" : "#dad8cf");
  const borderStrong = baseToken["--border-strong"] ?? (isDark ? "#53584e" : "#b9b4a7");
  const accent = baseToken["--accent"] ?? (isDark ? "#d39366" : "#a35f3b");
  const attention = baseToken["--attention"] ?? (isDark ? "#e07a6e" : "#8b3e35");
  const positive = baseToken["--positive"] ?? (isDark ? "#86ad8e" : "#55705a");

  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: accent,
      colorInfo: accent,
      colorSuccess: positive,
      colorError: attention,
      colorWarning: "#d97706",
      colorBgLayout: canvas,
      colorBgContainer: surface,
      colorBgElevated: raised,
      colorTextBase: textPrimary,
      colorText: textPrimary,
      colorTextSecondary: textSecondary,
      colorBorder: borderStrong,
      colorBorderSecondary: borderSubtle,
      borderRadius: 10,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans CJK SC", sans-serif',
      controlHeight: 36,
    },
    components: {
      Button: {
        controlHeight: 40,
        borderRadius: 10,
      },
      Input: {
        controlHeight: 40,
        borderRadius: 10,
      },
      Select: {
        controlHeight: 36,
        borderRadius: 8,
      },
      Modal: {
        borderRadiusLG: 14,
      },
      Segmented: {
        borderRadius: 8,
        controlHeight: 32,
      },
      Tag: {
        borderRadiusSM: 6,
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
      "--canvas": read("--canvas") || undefined,
      "--surface": read("--surface") || undefined,
      "--surface-raised": read("--surface-raised") || undefined,
      "--text-primary": read("--text-primary") || undefined,
      "--text-secondary": read("--text-secondary") || undefined,
      "--border-subtle": read("--border-subtle") || undefined,
      "--border-strong": read("--border-strong") || undefined,
      "--accent": read("--accent") || undefined,
      "--attention": read("--attention") || undefined,
      "--positive": read("--positive") || undefined,
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
