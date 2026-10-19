/* 按工作台实际面板宽度适应画布，仅尺寸变化重新取景，节点点击保持视角。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
export function useGraphSize() {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return { root, ...size };
}

export function useGraphViewport(width: number, height: number, bounds: { x: number; y: number; width: number; height: number }) {
  const flow = useRef<Pick<ReactFlowInstance, "fitBounds">>(null);
  const { x, y, width: span, height: depth } = bounds;
  useEffect(() => {
    if (width > 0 && height > 0) void flow.current?.fitBounds({ x, y, width: span, height: depth }, { padding: 0.03 });
  }, [width, height, x, y, span, depth]);
  return flow;
}
