/* 本机人类成员的交互心跳；只上报状态枚举，后台与静默操作不清除界面通知。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useEffect } from "react";
import type { MemberActivity } from "../services/collaborationService";

export function useTeamPresence(enabled: boolean, report: (status: MemberActivity) => Promise<boolean>) {
  useEffect(() => {
    if (!enabled) return;
    let alive = true, pending = false, lastActivity = Date.now(), lastEdit = 0, lastAttempt = 0;
    let sent: MemberActivity | undefined;
    const tick = async () => {
      const now = Date.now();
      const status = document.hidden || !document.hasFocus() || now - lastActivity >= 60_000 ? "idle" : now - lastEdit < 15_000 ? "working" : "online";
      if (!alive || pending || now - lastAttempt < 2000 || (sent === status && now - lastAttempt < 20_000)) return;
      pending = true; lastAttempt = now; sent = status;
      try { await report(status); }
      catch { /* 暂时断开时等待下一次心跳，保留现有内容。 */ }
      finally { pending = false; }
    };
    const interact = (event: Event) => { lastActivity = Date.now(); if (event.type === "input") lastEdit = lastActivity; void tick(); };
    const visibility = () => { void tick(); };
    for (const name of ["pointerdown", "keydown", "input"]) document.addEventListener(name, interact, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", visibility); window.addEventListener("blur", visibility);
    const timer = setInterval(() => { void tick(); }, 1000);
    void tick();
    return () => {
      alive = false; clearInterval(timer);
      for (const name of ["pointerdown", "keydown", "input"]) document.removeEventListener(name, interact, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", visibility); window.removeEventListener("blur", visibility);
    };
  }, [enabled, report]);
}
