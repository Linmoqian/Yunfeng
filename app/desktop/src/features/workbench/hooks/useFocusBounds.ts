/* 指针使用真实区域边界；滚动、缩放和组件挂载后重新定位，不占用页面布局。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useState } from "react";
import { focusElement, type ComponentFocus } from "../services/componentFocus";
export interface FocusBounds { left: number; top: number; width: number; height: number }
export function useFocusBounds(focus: ComponentFocus | null) {
  const [bounds, setBounds] = useState<FocusBounds | null>(null);
  useEffect(() => {
    if (!focus) { setBounds(null); return; }
    let frame = 0, element: HTMLElement | null = null;
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      frame = 0;
      const target = focusElement(focus);
      if (target !== element) { resize.disconnect(); element = target; if (target) resize.observe(target); }
      const rect = target?.getBoundingClientRect();
      const left = Math.max(0, rect?.left ?? 0), top = Math.max(34, rect?.top ?? 0);
      const right = Math.min(window.innerWidth, rect?.right ?? 0), bottom = Math.min(window.innerHeight, rect?.bottom ?? 0);
      const next = rect && right > left && bottom > top ? { left: Math.round(left), top: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) } : null;
      setBounds((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
    const changes = new MutationObserver(schedule);
    changes.observe(document.querySelector(".app-viewport") ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    measure();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); changes.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [focus?.component, focus?.target]);
  return bounds;
}
