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

export function TeamNoticeBoard({ state }: { state: TeamWorkspace }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null), wasEditing = useRef(false);
  const reduced = useReducedMotion();
  useEffect(() => { if (wasEditing.current && !editing) editButton.current?.focus(); wasEditing.current = editing; }, [editing]);
  async function save() {
    if (!state.team || state.busy) return;
    setFailed(false);
    if (await state.saveBoard(draft, state.links)) setEditing(false); else setFailed(true);
  }
  return <section className={styles.noticeBoard} aria-label="团队告示牌">
    <header className={styles.boardHeader}><span className={styles.boardIcon}><Megaphone size={16} /></span><h3>团队公告</h3><span className={styles.boardTag}>告示牌</span>
      {!editing && <Button ref={editButton} type="text" size="small" title="编辑公告" aria-label="编辑团队公告" icon={<Pencil size={14} />} disabled={!state.team || state.busy} onClick={() => { setDraft(state.board); setFailed(false); setEditing(true); }} />}
    </header>
    <AnimatePresence mode="wait" initial={false}><motion.div key={editing ? "editing" : "reading"} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.12 }}>
      {editing ? <form className={styles.boardEditor} onKeyDown={(event) => { if (event.key === "Escape" && !event.nativeEvent.isComposing && !state.busy) { event.stopPropagation(); setEditing(false); } }} onSubmit={(event) => { event.preventDefault(); void save(); }}><Input.TextArea autoFocus aria-label="团队公告" autoSize={{ minRows: 4, maxRows: 10 }} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写下团队需要知道的事…" />
        {failed && <p className={styles.saveError} role="alert">保存未完成，草稿已保留。请重试。</p>}<div className={styles.boardActions}><Button type="text" size="small" icon={<X size={13} />} disabled={state.busy} onClick={() => setEditing(false)}>取消</Button><Button type="primary" size="small" htmlType="submit" icon={<Check size={13} />} loading={state.busy}>保存</Button></div>
      </form> : state.board ? <p className={styles.boardText}>{state.board}</p> : <div className={styles.boardEmpty}><strong>暂无公告</strong><p>{state.team ? "发布通知、约定或本周重点。" : "创建团队后，可在此发布公告。"}</p></div>}
    </motion.div></AnimatePresence>
    <footer className={styles.boardFooter}><span />仅本地可见</footer>
  </section>;
}
