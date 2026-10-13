/* 团队交互预览沿用 LianAgent 布局，状态驻留前端。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { Button, Input } from "antd";
import { ArrowLeft, Send, Users } from "lucide-react";
import { useState } from "react";
import type { TeamPreview } from "../hooks/useTeamPreview";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";

export function TeamChat({ state, onBack }: { state: TeamPreview; onBack: () => void }) {
  const [draft, setDraft] = useState("");
  function send() {
    if (!draft.trim() || !state.running || !state.team) return;
    state.setMessages((current) => [...current, { id: crypto.randomUUID(), name: state.team!.owner, text: draft.trim() }]); setDraft("");
  }
  return <section className={styles.chat} aria-label="团队聊天">
    <header className={styles.toolbar}><button className={shell.iconButton} type="button" onClick={onBack} aria-label="返回工作区"><ArrowLeft size={16} /></button><h2><Users size={18} />团队</h2><span>前端交互预览</span></header>
    {state.notice && <p className={shell.notice} role="status">{state.notice}</p>}
    <div className={styles.chatLog} role="log" aria-label="团队消息">{state.messages.length ? state.messages.map((message) => <article key={message.id}><small>{message.name}</small><p>{message.text}</p></article>) : <div className={shell.empty}><Users size={30} /><p>加入团队后，开始一段协作对话。</p><span>聊天内容只保存在当前界面。</span></div>}</div>
    <form className={styles.teamComposer} onSubmit={(event) => { event.preventDefault(); send(); }}><Input.TextArea aria-label="团队消息" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={state.running ? "输入团队消息" : "先创建或加入团队"} disabled={!state.running} autoSize={{ minRows: 2, maxRows: 5 }} /><Button type="primary" shape="circle" aria-label="发送团队消息" disabled={!state.running || !draft.trim()} onClick={send} icon={<Send size={16} />} /></form>
  </section>;
}
