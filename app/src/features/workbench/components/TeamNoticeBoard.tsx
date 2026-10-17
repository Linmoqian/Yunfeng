/* 专用团队告示牌；保存由 Rust 确认，失败时保留编辑草稿。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Input } from "antd";
import { Check, Megaphone, Pencil, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import styles from "./TeamWorkspace.module.css";
import { Capsule } from "./Capsule";

export function TeamNoticeBoard({ state }: { state: TeamWorkspace }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const dirty = draft.trim() !== state.board;
  const editButton = useRef<HTMLButtonElement>(null), wasEditing = useRef(false);
  const reduced = useReducedMotion();
  useEffect(() => { if (wasEditing.current && !editing) editButton.current?.focus(); wasEditing.current = editing; }, [editing]);
  async function save() {
    if (state.canEditBoard === false || !state.team || state.busy || inFlight.current || !dirty) return;
    inFlight.current = true; setSaving(true); setFailed(false); setSaved(false);
    try {
      if (await state.saveBoard(draft, state.links)) { setEditing(false); setSaved(true); } else setFailed(true);
    } catch { setFailed(true); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <section className={styles.noticeBoard} aria-label="团队告示牌">
    <header className={styles.boardHeader}><span className={styles.boardIcon}><Megaphone size={16} /></span><h3>团队公告</h3><span className={styles.boardTag}>告示牌</span><span className={styles.boardFeedback} role="status" aria-live="polite">{saving ? "保存中…" : editing && dirty ? "未保存" : saved && !editing ? <Capsule className={styles.savedBadge}><Check size={11} />已保存</Capsule> : ""}</span>
      {!editing && <Button ref={editButton} type="text" size="small" title="编辑公告" aria-label="编辑团队公告" icon={<Pencil size={14} />} disabled={!state.team || state.busy || state.canEditBoard === false} onClick={() => { setDraft(state.board); setFailed(false); setSaved(false); setEditing(true); }} />}
    </header>
    <AnimatePresence mode="wait" initial={false}><motion.div key={editing ? "editing" : "reading"} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.12 }}>
      {editing ? <form className={styles.boardEditor} onKeyDown={(event) => { if (event.key === "Escape" && !event.nativeEvent.isComposing && !state.busy && !saving) { event.stopPropagation(); setEditing(false); } if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); } }} onSubmit={(event) => { event.preventDefault(); void save(); }}><Input.TextArea disabled={saving} autoFocus aria-label="团队公告" autoSize={{ minRows: 4, maxRows: 10 }} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写下团队需要知道的事…" />
        {failed && <p className={styles.saveError} role="alert">保存未完成，草稿已保留。请重试。</p>}<div className={styles.boardActions}><Button type="text" size="small" icon={<X size={13} />} disabled={state.busy || saving} onClick={() => setEditing(false)}>取消</Button><Button type="primary" size="small" htmlType="submit" icon={<Check size={13} />} disabled={!dirty || state.busy} loading={saving}>保存</Button></div>
      </form> : state.board ? <p className={styles.boardText}>{state.board}</p> : <div className={styles.boardEmpty}><strong>暂无公告</strong><p>{state.team ? "发布通知、约定或本周重点。" : "创建团队后，可在此发布公告。"}</p></div>}
    </motion.div></AnimatePresence>
    <footer className={styles.boardFooter}><span />仅本地可见</footer>
  </section>;
}
