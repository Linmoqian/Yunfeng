/* 注册组件的可见、编辑和呈现反馈；有界心跳续租，输入时立即让出。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useState } from "react";
import { focusElement } from "../services/componentFocus";
import { componentInteraction, presentation, type ComponentInteraction } from "../services/componentInteraction";
import type { SharedComponentId } from "../services/componentSharing";
let sequence = 0;
export function useComponentInteraction() {
  const [statuses, setStatuses] = useState<Partial<Record<SharedComponentId, ComponentInteraction>>>({});
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    const label = getCurrentWebviewWindow().label;
    const components: SharedComponentId[] = label === "component-writing" ? ["writing"] : label === "component-resources" ? ["resources"] : ["writing", "resources"];
    let alive = true, stop: (() => void) | undefined, frame = 0;
    let running = false, again = false, pressed = false;
    const touched = new Map<SharedComponentId, number>();
    const versions = new Map<SharedComponentId, number>();
    const accept = (status: ComponentInteraction) => { if (alive && status.version >= (versions.get(status.component) ?? -1)) { versions.set(status.component, status.version); setError(false); setStatuses((previous) => previous[status.component] && (["known", "visible", "rendered", "renderedRevision", "editing", "yielded"] as const).every((key) => previous[status.component]![key] === status[key]) ? previous : { ...previous, [status.component]: status }); } };
    const report = async () => {
      if (!alive) return;
      if (running) { again = true; return; }
      running = true;
      try {
        for (const component of components) {
          if (!alive) break;
          const root = focusElement({ component, target: "component", revision: 0 });
          const rect = root?.getBoundingClientRect();
          const visible = document.visibilityState !== "hidden" && !!rect && rect.right > 0 && rect.bottom > 34 && rect.left < innerWidth && rect.top < innerHeight;
          const active = document.activeElement;
          const editable = active instanceof HTMLElement && (active.matches('input:not([type="file"]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])') || active.isContentEditable);
          const committed = presentation(component);
          const editing = pressed || committed.pending || (editable && document.hasFocus()) || (touched.get(component) ?? 0) > Date.now();
          sequence = Math.max(sequence + 1, Date.now() * 1000);
          accept(await componentInteraction.report(component, { sequence, visible, renderedRevision: visible ? committed.revision : null, editing }));
        }
      } catch { if (alive) setError(true); }
      finally { running = false; if (alive && again) { again = false; void report(); } }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; void report(); }); };
    const interaction = (event: Event) => {
      if (event.type === "pointerdown") pressed = true;
      if (["pointerup", "pointercancel", "blur"].includes(event.type)) pressed = false;
      if (["pointerdown", "pointerup", "keydown", "wheel"].includes(event.type) && event.target instanceof Node) for (const component of components) {
        const root = focusElement({ component, target: "component", revision: 0 });
        if (root?.contains(event.target) || !components.some((id) => focusElement({ component: id, target: "component", revision: 0 })?.contains(event.target as Node))) touched.set(component, Date.now() + 1200);
      }
      // 不等待心跳，焦点和输入事件立即提交门禁状态。
      if (event.type === "wheel") schedule(); else void report();
    };
    const changes = new MutationObserver(schedule);
    changes.observe(document.querySelector(".app-viewport") ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
    for (const name of ["focusin", "focusout", "input", "compositionstart", "compositionend", "pointerdown", "pointerup", "pointercancel", "keydown", "wheel", "visibilitychange", "component-presentation"]) document.addEventListener(name, interaction, true);
    window.addEventListener("component-presentation", interaction);
    window.addEventListener("focus", interaction); window.addEventListener("blur", interaction);
    window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true);
    void componentInteraction.subscribe(accept).then((unsubscribe) => { if (alive) stop = unsubscribe; else unsubscribe(); }).catch(() => { if (alive) setError(true); });
    void report();
    const heartbeat = setInterval(() => { void report(); }, 1000);
    return () => {
      alive = false; stop?.(); clearInterval(heartbeat); cancelAnimationFrame(frame); changes.disconnect();
      for (const name of ["focusin", "focusout", "input", "compositionstart", "compositionend", "pointerdown", "pointerup", "pointercancel", "keydown", "wheel", "visibilitychange", "component-presentation"]) document.removeEventListener(name, interaction, true);
      window.removeEventListener("component-presentation", interaction); window.removeEventListener("focus", interaction); window.removeEventListener("blur", interaction);
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
    };
  }, []);
  return { statuses, error };
}
