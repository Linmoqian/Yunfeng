/* 关系图呈现确认与人工优先：只消费一次聚焦，操作后不补播旧请求。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from "react";
import { researchGraphComponent } from "../../../services/researchGraphComponent";
export function useResearchGraphComponent(taskId: string, revision: number, onFocus: (id: string) => Promise<void>) {
  const root = useRef<HTMLElement>(null);
  const latest = useRef({ revision, onFocus }); latest.current = { revision, onFocus };
  const [agentTarget, setAgentTarget] = useState<string | null>(null);
  const [yielded, setYielded] = useState(false);
  const yieldControl = useRef<() => void>(() => {});
  useEffect(() => {
    let closed = false, sending = false, again = false, pressed = false, touched = 0, seen = 0, focused: number | null = null;
    let frame = 0, epoch: string | null = null;
    const visible = () => {
      const rect = root.current?.getBoundingClientRect();
      return document.visibilityState === "visible" && !!rect && rect.width > 0 && rect.height > 0 && rect.bottom > 34 && rect.top < innerHeight;
    };
    const editing = () => pressed || Date.now() < touched || !!document.activeElement?.matches("input,textarea,[contenteditable=true]");
    const send = async () => {
      if (closed) return;
      if (sending) { again = true; return; }
      sending = true;
      try {
        const snapshot = await researchGraphComponent(taskId, { action: "report", report: { sequence: Date.now() * 1000 + (++sequence % 1000),
          epoch, visible: visible(), editing: editing(), renderedRevision: latest.current.revision, focusedRevision: focused } });
        if (closed) return;
        const focus = snapshot.focus;
        if (epoch !== focus.epoch) { epoch = focus.epoch; seen = 0; focused = null; }
        if (focus.revision > seen) {
          seen = focus.revision;
          if (focus.target && visible() && !editing()) {
            await latest.current.onFocus(focus.target);
            await new Promise<void>((done) => requestAnimationFrame(() => done()));
            if (closed || editing() || !visible()) return;
            focused = focus.revision; setAgentTarget(focus.target); again = true;
          } else if (!focus.target) setAgentTarget(null);
        }
        setYielded(editing());
      } catch { if (!closed) setAgentTarget(null); }
      finally { sending = false; if (again && !closed) { again = false; void send(); } }
    };
    const touch = () => { touched = Date.now() + 1200; focused = null; setAgentTarget(null); setYielded(true); void send(); };
    yieldControl.current = touch;
    const down = () => { pressed = true; touch(); };
    const up = () => { pressed = false; touch(); };
    const changed = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => void send()); };
    // 包括画布外编辑：工程师输入期间不移动其视野。
    document.addEventListener("pointerdown", down, true); document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true); document.addEventListener("wheel", touch, { capture: true, passive: true });
    document.addEventListener("keydown", touch, true); document.addEventListener("input", touch, true);
    document.addEventListener("visibilitychange", changed); window.addEventListener("blur", up);
    const timer = setInterval(() => void send(), 800); changed();
    return () => {
      closed = true; clearInterval(timer); cancelAnimationFrame(frame); yieldControl.current = () => {};
      document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true); document.removeEventListener("wheel", touch, true);
      document.removeEventListener("keydown", touch, true); document.removeEventListener("input", touch, true);
      document.removeEventListener("visibilitychange", changed); window.removeEventListener("blur", up);
      void researchGraphComponent(taskId, { action: "report", report: { sequence: Date.now() * 1000 + (++sequence % 1000), epoch, visible: false, editing: false, renderedRevision: null, focusedRevision: null } }).catch(() => {});
    };
  }, [taskId]);
  return { root, agentTarget, yielded, yieldControl: () => yieldControl.current() };
}
let sequence = 0;
