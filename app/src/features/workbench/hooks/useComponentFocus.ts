/* 订阅共享指针并按版本去重；订阅后读取与窗口聚焦补偿丢失事件。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { componentFocus, type ComponentFocus } from "../services/componentFocus";
export function useComponentFocus() {
  const [focus, setFocus] = useState<ComponentFocus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true, stop: (() => void) | undefined;
    let revision = -1;
    const label = getCurrentWebviewWindow().label;
    const components = label === "component-writing" ? ["writing"] as const : label === "component-resources" ? ["resources"] as const : ["writing", "resources"] as const;
    const accept = (next: ComponentFocus) => {
      if (!alive || next.revision < revision || !components.some((id) => id === next.component)) return;
      revision = next.revision;
      setError(false);
      setFocus((current) => next.target ? (current?.component === next.component && current.target === next.target && current.revision === next.revision ? current : next) : current?.component === next.component || (current && current.revision < next.revision) ? null : current);
    };
    const refresh = async () => {
      try { for (const component of components) accept(await componentFocus.read(component)); }
      catch { if (alive) setError(true); }
    };
    void componentFocus.subscribe(accept).then((unsubscribe) => {
      if (!alive) { unsubscribe(); return; }
      stop = unsubscribe; void refresh();
    }).catch(() => { if (alive) setError(true); });
    window.addEventListener("focus", refresh);
    return () => { alive = false; stop?.(); window.removeEventListener("focus", refresh); };
  }, []);
  return { focus, error };
}
