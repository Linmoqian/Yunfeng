/* 延迟出现与最短驻留抑制状态闪烁；不控制业务请求或内容卸载。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from "react";

export interface VisibilityOptions { delay?: number; minimum?: number; settle?: number; immediate?: boolean }
/** 时间单位为毫秒；immediate 用于需立即可见的真实错误，卸载时清理计时器。 */
export function useStableVisibility(active: boolean, { delay = 600, minimum = 1200, settle = 400, immediate = false }: VisibilityOptions = {}): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (immediate || (active && visible)) return;
    const timer = setTimeout(() => {
      if (active) { shownAt.current = Date.now(); setVisible(true); }
      else setVisible(false);
    }, active ? delay : Math.max(settle, minimum - (Date.now() - shownAt.current)));
    return () => clearTimeout(timer);
  }, [active, delay, immediate, minimum, settle, visible]);
  return immediate || visible;
}
