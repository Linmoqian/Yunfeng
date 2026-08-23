// Yunfeng 自定义标题栏（macOS 风格）：无边框透明窗口的拖拽区 + 红绿灯窗口控制。
// 拖拽与双击最大化依赖 Tauri 内建 data-tauri-drag-region 脚本（drag.js），
// 此处不重复实现双击逻辑，避免与内建 internal_toggle_maximize 双重触发。
// 拖拽区内的非交互子元素以 pointer-events: none 穿透，保证 mousedown 命中带属性的容器。

import { Minus, Plus, X } from "lucide-react";

import { useWindowControls } from "./useWindowControls";
import styles from "./TitleBar.module.css";

export function TitleBar() {
  const { isDesktop, isFocused, isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  return (
    <header className={styles.titlebar} data-tauri-drag-region data-inactive={isFocused ? undefined : "true"}>
      {isDesktop ? (
        <div className={styles.lights}>
          <button type="button" className={`${styles.light} ${styles.lightClose}`} onClick={close} aria-label="关闭窗口" title="关闭">
            <X className={styles.glyph} size={9} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <button type="button" className={`${styles.light} ${styles.lightMinimize}`} onClick={minimize} aria-label="最小化窗口" title="最小化">
            <Minus className={styles.glyph} size={9} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.light} ${styles.lightZoom}`}
            onClick={toggleMaximize}
            aria-label={isMaximized ? "还原窗口" : "最大化窗口"}
            title={isMaximized ? "还原" : "最大化"}
          >
            <Plus className={styles.glyph} size={9} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className={styles.lightsPlaceholder} data-tauri-drag-region />
      )}

      <div className={styles.title} data-tauri-drag-region>
        <span className={styles.titleText}>云枫 Yunfeng</span>
      </div>

      <div className={styles.trailing} data-tauri-drag-region />
    </header>
  );
}
