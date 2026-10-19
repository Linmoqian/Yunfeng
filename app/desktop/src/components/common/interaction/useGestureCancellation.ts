/* Escape 与失焦结束临时手势；回调取最新值，不重复注册窗口监听。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef } from "react";

/** 仅取消尚未提交的界面手势；持久化请求是否可取消由业务负责。 */
export function useGestureCancellation(active: boolean, onCancel: () => void): void {
  const callback = useRef(onCancel);
  callback.current = onCancel;
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.isComposing) callback.current(); };
    const blur = () => callback.current();
    window.addEventListener("keydown", key); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("blur", blur); };
  }, [active]);
}
