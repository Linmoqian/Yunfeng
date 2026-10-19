/* 团队 UI 只持有 Rust 快照，存储操作失败时保留原内容与用户草稿。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getRuntimeWindowPlatform } from "../../../components/titlebar/windowPlatform";
import { collaborationAction, collaborationError, type CollaborationAction, type CollaborationLink, type CollaborationSnapshot, type MemberProfile } from "../services/collaborationService";
import type { MemberActivity } from "../services/collaborationService";
import { useTeamPresence } from "./useTeamPresence";

export function useTeamWorkspace(active: boolean) {
  const available = getRuntimeWindowPlatform() !== "browser";
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [notice, setNotice] = useState("");
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const inFlight = useRef(false);
  const background = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const run = useCallback(async (input: CollaborationAction, success = ""): Promise<boolean> => {
    if (!available) { setNotice("团队功能需要在 Yunfeng 原生桌面应用中运行"); return false; }
    if (background.current) await background.current;
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setNotice("");
    try {
      const next = await collaborationAction(input);
      if (mounted.current) { setSnapshot(next); setConnectionLost(false); setNotice(success); }
      return true;
    } catch (error) {
      if (mounted.current) { setNotice(collaborationError(error)); if (input.action === "snapshot" || input.action === "nodeRefresh") setConnectionLost(true); }
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [available]);
  useEffect(() => { if (active) void run({ action: "snapshot" }); }, [active, run]);
  const reload = () => run({ action: "nodeRefresh" });
  const saveBoard = (announcement: string, links: CollaborationLink[]) => run({ action: "board", announcement, links }, "公告与链接已保存");
  const self = snapshot?.participants?.find((member) => member.id === snapshot.installationId)?.profile;
  const teamId = snapshot?.team?.id;
  const quiet = useCallback((input: CollaborationAction) => {
    if (!available || inFlight.current) return Promise.resolve(false);
    inFlight.current = true;
    const request = (async () => { try {
      const next = await collaborationAction(input);
      if (mounted.current) { setSnapshot(next); setConnectionLost(false); if (input.action === "nodeRefresh") setNotice(""); }
      return true;
    } catch {
      if (mounted.current && input.action === "nodeRefresh") setConnectionLost(true);
      return false;
    } finally { inFlight.current = false; } })();
    background.current = request;
    void request.finally(() => { if (background.current === request) background.current = null; });
    return request;
  }, [available]);
  useEffect(() => {
    if (!active || !available) return;
    const timer = setInterval(() => { void quiet({ action: "nodeRefresh" }); }, 5000);
    return () => clearInterval(timer);
  }, [active, available, quiet]);
  const report = useCallback((status: MemberActivity) => quiet({ action: "presence", status }), [quiet]);
  useTeamPresence(active && available && !!teamId && self?.kind === "human" && self.enabled, report);
  return {
    canSend: !self || (self.enabled && self.access !== "observer"),
    canEditBoard: !self || (self.enabled && self.access === "editor"),
    available, busy, notice, snapshot, connectionLost,
    connection: snapshot?.connection,
    connect: (address: string) => run({ action: "nodeConnect", address }, "节点已连接"),
    disconnect: () => run({ action: "nodeDisconnect" }, "已返回本地团队"),
    team: snapshot?.team ?? null, messages: snapshot?.messages ?? [],
    participants: snapshot?.participants ?? [],
    relations: snapshot?.relations ?? [],
    presence: snapshot?.presence ?? [],
    saveRelation: (memberId: string, parentId: string | null) => run({ action: "relation", relation: { memberId, parentId } }, "直属关系已保存"),
    saveMember: (id: string, profile: MemberProfile) => run({ action: "member", member: { id, profile } }, "成员资料已保存"),
    board: snapshot?.board ?? "", links: snapshot?.links ?? [],
    files, setFiles, reload, saveBoard,
    create: (name: string, owner: string) => run({ action: "create", name, owner }, snapshot?.connection ? "节点团队已创建" : "本地团队已创建，尚未联网"),
    activate: (id: string) => run({ action: "activate", id }, "已恢复本地团队"),
    send: (id: string, text: string) => run({ action: "message", id, text }),
    leave: () => run({ action: "leave" }, "团队已关闭，本地记录保留"),
  };
}
export type TeamWorkspace = ReturnType<typeof useTeamWorkspace>;
