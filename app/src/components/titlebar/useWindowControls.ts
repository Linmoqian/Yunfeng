// 自定义标题栏的窗口控制：封装 Tauri 窗口操作、最大化与焦点状态订阅。
// 浏览器（非 Tauri）环境下全部降级为 no-op，标题栏据此隐藏红绿灯。

import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface WindowControls {
  /** 是否运行在 Tauri 桌面外壳中；浏览器中为 false。 */
  isDesktop: boolean;
  isFocused: boolean;
  isMaximized: boolean;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}

export function useWindowControls(): WindowControls {
  const [isFocused, setIsFocused] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    const current = getCurrentWindow();
    let disposed = false;
    const disposers: Array<() => void> = [];

    const retain = (fn: () => void) => {
      if (disposed) fn();
      else disposers.push(fn);
    };

    const syncMaximized = () => {
      current
        .isMaximized()
        .then((value) => {
          if (!disposed) setIsMaximized(value);
        })
        .catch(() => undefined);
    };

    syncMaximized();
    // 最大化与失焦可能来自双击拖拽区、系统快捷键、Dock 等外部入口，统一监听同步。
    current.onResized(syncMaximized).then(retain).catch(() => undefined);
    current
      .onFocusChanged(({ payload }) => setIsFocused(payload))
      .then(retain)
      .catch(() => undefined);

    return () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
    };
  }, []);

  const run = useCallback((action: () => Promise<unknown>, label: string) => {
    action().catch((error: unknown) => {
      console.warn(`[titlebar] ${label} 失败`, error);
    });
  }, []);

  const minimize = useCallback(() => {
    if (isDesktop) run(() => getCurrentWindow().minimize(), "最小化窗口");
  }, [run]);

  const toggleMaximize = useCallback(() => {
    if (isDesktop) run(() => getCurrentWindow().toggleMaximize(), "切换窗口最大化");
  }, [run]);

  // 关闭由 Rust 端 CloseRequested 拦截为隐藏到托盘（见 tray.rs），此处只发起请求。
  const close = useCallback(() => {
    if (isDesktop) run(() => getCurrentWindow().close(), "关闭窗口");
  }, [run]);

  return { isDesktop, isFocused, isMaximized, minimize, toggleMaximize, close };
}
