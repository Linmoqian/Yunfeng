/* LianAgent 停靠侧栏：拖动换边、键盘调宽与 64px 图标模式。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { ArrowLeftRight, GripVertical, PanelsTopLeft, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { useWorkspaceLayout } from "../hooks/useWorkspaceLayout";
import { DEFAULT_LAYOUT, PANEL_MAX_WIDTH, type PanelId } from "../workspaceLayout";
import { SPRING_LAYOUT } from "../workspaceMotion";
import styles from "./WorkspaceShell.module.css";
import cloudMascot from "@yunfeng/ui/assets/yunfeng-cloud.png";

export function DockPanel({ panel, title, dock, children }: {
  panel: PanelId; title: string; dock: ReturnType<typeof useWorkspaceLayout>; children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const left = (panel === "navigation") !== dock.layout.reversed;
  const width = dock.renderedLayout[panel];
  const open = dock.layout[`${panel}Open`];
  return (
    <motion.aside className={styles.panel} data-side={left ? "left" : "right"}
      data-compact={width <= 160 || undefined} data-open={open} aria-label={title}
      style={{ width: open ? width : 0, order: left ? 0 : 2 }}
      layout={reduced || dock.resizing ? false : "position"} transition={SPRING_LAYOUT}>
      <div className={styles.panelContent} hidden={!open}>
        <div className={styles.panelHeader}>
          <button type="button" className={styles.grip} draggable
            aria-label={`拖动${title}到另一侧`} title="拖动到另一侧，或使用左右方向键"
            onDragStart={(event) => { event.dataTransfer.setData("application/yunfeng-panel", panel); }}
            onDragEnd={(event) => {
              if (event.clientX && ((event.clientX > (dock.rootRef.current?.getBoundingClientRect().left ?? 0) + (dock.rootRef.current?.clientWidth ?? 1280) / 2) === left)) dock.swap();
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault(); if ((event.key === "ArrowLeft") !== left) dock.swap();
              }
            }}>
            {panel === "navigation" ? <GripVertical size={14} /> : <PanelsTopLeft size={16} />}<span>{title}</span>
          </button>
          <button type="button" onClick={dock.swap} aria-label={`将${title}移到${left ? "右" : "左"}侧`} title="左右互换"><ArrowLeftRight size={14} /></button>
          <button type="button" onClick={() => dock.toggle(panel)} aria-label={`收起${title}`} title={`收起${title}`}>{panel === "navigation" ? <img src={cloudMascot} alt="" width={24} height={24} /> : <X size={15} />}</button>
        </div>
        <div className={styles.panelBody}>{children}</div>
      </div>
      {open && <div className={styles.resize} role="separator" tabIndex={0} aria-label={`调整${title}宽度`}
        aria-orientation="vertical" aria-valuenow={width} aria-valuemin={64} aria-valuemax={PANEL_MAX_WIDTH[panel]}
        onPointerDown={(event) => dock.begin(event, panel, left)} onPointerMove={dock.move}
        onPointerUp={(event) => dock.finish(event)} onPointerCancel={(event) => dock.finish(event, true)}
        onLostPointerCapture={(event) => dock.finish(event, true)}
        onDoubleClick={() => dock.resize(panel, DEFAULT_LAYOUT[panel])}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          dock.resize(panel, event.key === "Home" ? 64 : event.key === "End" ? PANEL_MAX_WIDTH[panel]
            : width + (event.key === "ArrowRight" ? 16 : -16) * (left ? 1 : -1), event.key === "Home" || event.key === "End");
        }} />}
    </motion.aside>
  );
}
