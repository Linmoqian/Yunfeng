/* 分栏调宽、吸附与停靠偏好；取消手势时恢复原宽度。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { DEFAULT_LAYOUT, fitWorkspaceLayout, normalizePanelWidth, readWorkspaceLayout, snapPanelWidth, type PanelId, type WorkspaceLayout } from "../workspaceLayout";

export function useWorkspaceLayout() {
  const [layout, setLayout] = useState(readWorkspaceLayout);
  const [resizing, setResizing] = useState<PanelId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(window.innerWidth);
  const renderedLayout = resizing ? layout : fitWorkspaceLayout(layout, viewport);
  const drag = useRef<{ panel: PanelId; x: number; width: number; original: WorkspaceLayout; left: boolean; latest: number } | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => setViewport(root.clientWidth));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!resizing) localStorage.setItem("yunfeng.workspace-layout.v1", JSON.stringify(layout));
  }, [layout, resizing]);
  function maximum(panel: PanelId): number {
    const other = panel === "navigation" ? "workbench" : "navigation";
    return Math.max(64, (rootRef.current?.clientWidth ?? 1280) - 324 - (layout[`${other}Open`] ? renderedLayout[other] : 0));
  }
  function resize(panel: PanelId, width: number, snap = false) {
    const bounded = Math.min(maximum(panel), normalizePanelWidth(panel, width));
    setLayout((current) => ({ ...current, [panel]: snap ? snapPanelWidth(panel, bounded) : bounded }));
  }
  function begin(event: PointerEvent<HTMLElement>, panel: PanelId, left: boolean) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { panel, x: event.clientX, width: renderedLayout[panel], latest: renderedLayout[panel], original: layout, left };
    setLayout((current) => ({ ...current, navigation: renderedLayout.navigation, workbench: renderedLayout.workbench }));
    setResizing(panel);
  }
  function move(event: PointerEvent<HTMLElement>) {
    if (!drag.current) return;
    const { panel, width, x, left } = drag.current;
    drag.current.latest = Math.min(maximum(panel), normalizePanelWidth(panel, width + (event.clientX - x) * (left ? 1 : -1)));
    resize(panel, drag.current.latest);
  }
  function finish(event: PointerEvent<HTMLElement>, cancel = false) {
    if (!drag.current) return;
    const { panel, original, latest } = drag.current;
    drag.current = null;
    if (cancel) setLayout(original);
    else resize(panel, latest, true);
    setResizing(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return {
    rootRef, layout, renderedLayout, resizing, setLayout, resize, begin, move, finish,
    reset: () => setLayout({ ...DEFAULT_LAYOUT }),
    toggle: (panel: PanelId) => setLayout((current) => ({ ...current, [`${panel}Open`]: !current[`${panel}Open`] })),
    swap: () => setLayout((current) => ({ ...current, reversed: !current.reversed })),
  };
}
