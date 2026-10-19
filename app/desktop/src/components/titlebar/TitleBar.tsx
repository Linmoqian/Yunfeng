// macOS 使用覆盖式原生标题栏；其他桌面平台提供自绘窗口按钮。
// 拖拽区与交互按钮互为兄弟节点，双击由 Tauri 内建脚本处理。

import { Copy, Minus, Square, X } from "lucide-react";

import { useWindowControls } from "./useWindowControls";
import mapleMark from "@yunfeng/ui/assets/maple-mark.png";
import styles from "./TitleBar.module.css";

export function TitleBar() {
  const { isDesktop, platform, error, isFocused, isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  return (
    <header className={styles.titlebar} data-platform={platform} data-inactive={isFocused ? undefined : "true"} aria-label="桌面标题栏">
      {platform === "macos" && <div className={styles.nativeControlsSpace} />}
      <div className={styles.dragRegion} data-tauri-drag-region>
        <img src={mapleMark} className={styles.logo} alt="" aria-hidden="true" draggable="false" />
        <span className={styles.titleText}>云枫 Yunfeng</span>
        <span className={styles.workspaceLabel}>个人工作区</span>
      </div>
      {error && <span className={styles.error} role="alert">{error}</span>}
      {isDesktop && platform !== "macos" && <div className={styles.windowControls}>
        <button type="button" onClick={minimize} aria-label="最小化窗口" title="最小化"><Minus size={15} /></button>
        <button type="button" onClick={toggleMaximize} aria-label={isMaximized ? "还原窗口" : "最大化窗口"} title={isMaximized ? "还原" : "最大化"}>{isMaximized ? <Copy size={13} /> : <Square size={13} />}</button>
        <button type="button" className={styles.close} onClick={close} aria-label="关闭窗口" title="关闭"><X size={16} /></button>
      </div>}
    </header>
  );
}
