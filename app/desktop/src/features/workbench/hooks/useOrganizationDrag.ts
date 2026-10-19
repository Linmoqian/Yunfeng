/* 拖放仅提交直属关系；候选由当前快照计算，等待 Rust 确认才更新组织图。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useRef, useState } from "react";
import type { MemberCard, CollaborationSnapshot } from "../services/collaborationService";
import type { TeamWorkspace } from "./useTeamWorkspace";

/** 排除自身、后代和原上级；空字符串表示解除直属关系。 */
export function organizationDropCandidates(memberId: string, members: MemberCard[], relations: NonNullable<CollaborationSnapshot["relations"]>): Set<string> {
  const excluded = new Set([memberId]);
  for (let size = 0; size !== excluded.size;) {
    size = excluded.size;
    for (const edge of relations) if (edge.parentId && excluded.has(edge.parentId)) excluded.add(edge.memberId);
  }
  const parent = relations.find((edge) => edge.memberId === memberId)?.parentId ?? "";
  return new Set(["", ...members.map((member) => member.id)].filter((id) => id !== parent && !excluded.has(id)));
}

export function useOrganizationDrag(state: TeamWorkspace) {
  const scope = useRef<HTMLElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [target, setTarget] = useState<string | undefined>();
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const session = useRef<{ id: string; candidates: Set<string> } | null>(null);
  const pending = useRef(false);
  const candidates = active ? organizationDropCandidates(active, state.participants ?? [], state.relations ?? []) : new Set<string>();
  function begin(member: MemberCard) {
    if (pending.current || state.busy || !state.available || member.nodeId !== state.snapshot?.installationId) return false;
    session.current = { id: member.id, candidates: organizationDropCandidates(member.id, state.participants ?? [], state.relations ?? []) };
    setActive(member.id); setTarget(undefined); setError("");
    return true;
  }
  function locate(point: { x: number; y: number }) {
    const element = document.elementFromPoint(point.x - window.scrollX, point.y - window.scrollY)?.closest<HTMLElement>("[data-drop-member]");
    const id = element?.dataset.dropMember;
    const valid = element && scope.current?.contains(element) && id !== undefined && session.current?.candidates.has(id);
    setTarget(valid ? id : undefined);
    return valid ? element : null;
  }
  function cancel() { session.current = null; setActive(null); setTarget(undefined); }
  async function commit(parent: string) {
    const selected = session.current;
    cancel();
    if (!selected || pending.current || !selected.candidates.has(parent)) return;
    pending.current = true; setSaving(true);
    try {
      if (!await state.saveRelation(selected.id, parent || null)) setError("关系未保存，请重试或在铭牌详情中调整。");
    } catch { setError("关系未保存，请重试或在铭牌详情中调整。"); }
    finally { pending.current = false; setSaving(false); }
  }
  return { scope, active, target, candidates, saving, error, begin, locate, cancel, commit };
}
export type OrganizationDrag = ReturnType<typeof useOrganizationDrag>;
