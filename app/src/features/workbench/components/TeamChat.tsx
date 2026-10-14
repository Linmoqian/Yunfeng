/* 消息由 Rust 事务确认后显示；尚未向远端投递。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Input } from "antd";
import { ArrowLeft, Send, Users } from "lucide-react";
import { useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";

export function TeamChat({ state, onBack }: { state: TeamWorkspace; onBack: () => void }) {
  const [draft, setDraft] = useState("");
  const [messageId, setMessageId] = useState(() => crypto.randomUUID());
  async function send() {
    if (!draft.trim() || state.busy || !state.team) return;
    const submitted = draft;
    if (await state.send(messageId, submitted)) {
      setDraft((current) => current === submitted ? "" : current);
      setMessageId(crypto.randomUUID());
    }
  }
  return <section className={styles.chat} aria-label="团队聊天">
    <header className={styles.toolbar}><button className={shell.iconButton} type="button" onClick={onBack} aria-label="返回工作区"><ArrowLeft size={16} /></button><h2><Users size={18} />{state.team?.name ?? "团队"}</h2><span>本地保存 · 尚未联网</span></header>
    {state.notice && <p className={shell.notice} role="status">{state.notice}</p>}
    <div className={styles.chatLog} role="log" aria-label="团队消息">{state.messages.length ? state.messages.map((message) => <article key={message.id}><small>{message.name} · 本地记录</small><p>{message.text}</p></article>) : <div className={shell.empty}><Users size={30} /><p>创建或恢复本地团队后开始记录。</p><span>消息由 Rust 保存，当前不向其他设备发送。</span></div>}</div>
    <form className={styles.teamComposer} onSubmit={(event) => { event.preventDefault(); void send(); }}><Input.TextArea aria-label="团队消息" value={draft} onChange={(event) => { setDraft(event.target.value); setMessageId(crypto.randomUUID()); }} maxLength={4000} placeholder={state.team ? "记录一条本地团队消息" : "先创建或恢复本地团队"} disabled={!state.available || !state.team} autoSize={{ minRows: 2, maxRows: 5 }} /><Button type="primary" shape="circle" aria-label="发送团队消息" loading={state.busy} disabled={!state.available || !state.team || !draft.trim() || state.busy} onClick={() => void send()} icon={<Send size={16} />} /></form>
  </section>;
}
