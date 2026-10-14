/* 团队 UI 只持有 Rust 快照，存储操作失败时保留原内容与用户草稿。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getRuntimeWindowPlatform } from "../../../components/titlebar/windowPlatform";
import { collaborationAction, collaborationError, type CollaborationAction, type CollaborationLink, type CollaborationSnapshot } from "../services/collaborationService";

export function useTeamWorkspace(active: boolean) {
  const available = getRuntimeWindowPlatform() !== "browser";
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const run = useCallback(async (input: CollaborationAction, success = ""): Promise<boolean> => {
    if (!available) { setNotice("团队功能需要在 Yunfeng 原生桌面应用中运行"); return false; }
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setNotice("");
    try {
      const next = await collaborationAction(input);
      if (mounted.current) { setSnapshot(next); setNotice(success); }
      return true;
    } catch (error) {
      if (mounted.current) setNotice(collaborationError(error));
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [available]);
  useEffect(() => { if (active) void run({ action: "snapshot" }); }, [active, run]);
  const reload = () => run({ action: "snapshot" });
  const saveBoard = (announcement: string, links: CollaborationLink[]) => run({ action: "board", announcement, links }, "公告与链接已保存到本机");
  return {
    available, busy, notice, snapshot,
    team: snapshot?.team ?? null, messages: snapshot?.messages ?? [],
    board: snapshot?.board ?? "", links: snapshot?.links ?? [],
    files, setFiles, reload, saveBoard,
    create: (name: string, owner: string) => run({ action: "create", name, owner }, "本地团队已创建，尚未联网"),
    activate: (id: string) => run({ action: "activate", id }, "已恢复本地团队"),
    send: (id: string, text: string) => run({ action: "message", id, text }),
    leave: () => run({ action: "leave" }, "团队已关闭，本地记录保留"),
  };
}
export type TeamWorkspace = ReturnType<typeof useTeamWorkspace>;
