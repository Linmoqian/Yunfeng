/* 本地团队聊天：轻量状态、稳定消息与输入；Rust 确认后才展示消息。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Input } from "antd";
import { ArrowLeft, ArrowUp, HardDrive, Network, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import { TeamMemberList } from "./TeamMemberList";
import { Capsule } from "./Capsule";
import styles from "./TeamWorkspace.module.css";
import composer from "./Composer.module.css";
import shell from "./WorkspaceShell.module.css";

export function TeamChat(props: { state: TeamWorkspace; onBack: () => void }) {
  return <TeamConversation key={`${props.state.snapshot?.installationId}:${props.state.team?.id}`} {...props} />;
}
function TeamConversation({ state, onBack }: { state: TeamWorkspace; onBack: () => void }) {
  const [graph, setGraph] = useState(false);
  const [draft, setDraft] = useState("");
  const [messageId, setMessageId] = useState(() => crypto.randomUUID());
  const sending = useRef(false), reduced = useReducedMotion();
  async function send() {
    if (state.canSend === false || !draft.trim() || state.busy || !state.available || !state.team || sending.current) return;
    const submitted = draft;
    sending.current = true;
    try {
      if (await state.send(messageId, submitted)) {
        setDraft((current) => current === submitted ? "" : current);
        setMessageId(crypto.randomUUID());
      }
    } finally { sending.current = false; }
  }
  return <section className={styles.chat} aria-label="团队聊天">
    <header className={styles.toolbar}><button className={shell.iconButton} type="button" onClick={onBack} aria-label="返回工作区"><ArrowLeft size={16} /></button><h2><Users size={17} /><span>{state.team?.name ?? "团队"}</span></h2>
      <button type="button" className={styles.viewToggle} aria-label="成员关系" aria-pressed={graph} onClick={() => setGraph(!graph)}><Network size={14} /><span>关系图</span></button>
      <Capsule className={styles.localStatus} title={state.connection ? `${state.connection.name} · ${state.connection.address}${state.connection.peerFailures ? " · 部分邻居暂不可达" : ""}` : "仅保存在本机"} animateOnMount={false}><span />{state.connectionLost ? "重连中" : state.connection ? "节点已连接" : "本地 · 未联网"}</Capsule></header>
    {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
    {graph ? <div className={styles.organizationCanvas} aria-label="团队关系图"><div className={styles.organizationContent}><TeamMemberList state={state} /><p className={styles.hint}>选择成员查看直属关系，点击铭牌查看详情。</p></div></div> : <div className={styles.chatLog} role="log" aria-label="团队消息"><motion.div className={styles.messages} initial={false}>
      {state.messages.length ? state.messages.map((message) => <motion.article key={message.id} initial={reduced ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}><small>{message.name}</small><p>{message.text}</p></motion.article>) : <motion.div key={state.team?.id ?? "empty"} className={styles.empty} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}><span className={styles.emptyIcon}><Users size={25} strokeWidth={1.5} /></span><h3>{state.team ? "从一条消息开始" : "开始团队记录"}</h3><p>{state.team ? "记录想法，与团队一起推进。" : "在通讯录创建团队或连接本机节点。"}</p><small>{state.connection ? "消息通过已配对节点同步" : "消息仅保存在本机，尚未联网"}</small></motion.div>}
    </motion.div></div>}
    <div className={composer.dock}><form className={`${composer.composer} ${styles.composer}`} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <Input.TextArea aria-label="团队消息" value={draft} onChange={(event) => { setDraft(event.target.value); setMessageId(crypto.randomUUID()); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void send(); } }} maxLength={4000} placeholder={state.team ? "与团队分享想法…" : "创建团队后开始记录…"} disabled={!state.available || !state.team || state.canSend === false} autoSize={{ minRows: 2, maxRows: 5 }} />
      <div className={composer.footer}><span className={styles.composerHint}><HardDrive size={12} />{state.connection ? "节点同步" : "本地记录"}</span><Button className={`${composer.submit} ${styles.submit}`} type="primary" shape="circle" htmlType="submit" aria-label="发送团队消息" loading={state.busy} disabled={!state.available || !state.team || !draft.trim() || state.busy || state.canSend === false} icon={<ArrowUp size={15} />} /></div>
    </form></div>
  </section>;
}
