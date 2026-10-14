/* 公告与链接保存到 Rust；文件选择仍只展示本地清单。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { App, Button, Input, Tabs } from "antd";
import { ArrowLeftRight, Files, Megaphone, Plus } from "lucide-react";
import { useRef, useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";

export function TeamWorkbench({ state }: { state: TeamWorkspace }) {
  const { modal } = App.useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [boardDraft, setBoardDraft] = useState("");
  function addLink() {
    let title = "", url = "";
    modal.confirm({ title: "添加协作链接", icon: null, content: <div className={styles.fields}><Input aria-label="链接标题" placeholder="标题" onChange={(event) => { title = event.target.value; }} /><Input aria-label="链接地址" placeholder="https://" onChange={(event) => { url = event.target.value; }} /></div>, okText: "添加", cancelText: "取消", onOk: () => {
      if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error("请输入 HTTP 或 HTTPS 链接"));
      return state.saveBoard(state.board, [...state.links, { title: title.trim() || url, url }]).then((saved) => { if (!saved) throw new Error("保存失败，请查看行内提示"); });
    } });
  }
  return <div className={styles.pane}><Tabs defaultActiveKey="board" size="small" items={[
    { key: "board", label: <span><Megaphone size={14} /> 公告</span>, children: <>
      <div className={styles.sectionTitle}><strong>团队公告</strong><Button size="small" disabled={!state.team || state.busy} onClick={() => { setBoardDraft(state.board); setEditing(true); }}>编辑</Button></div>
      {editing ? <div className={styles.fields}><Input.TextArea aria-label="团队公告" rows={5} maxLength={4000} value={boardDraft} onChange={(event) => setBoardDraft(event.target.value)} /><div className={styles.buttonRow}><Button size="small" onClick={() => setEditing(false)}>取消</Button><Button type="primary" size="small" loading={state.busy} onClick={async () => { if (await state.saveBoard(boardDraft, state.links)) setEditing(false); }}>保存</Button></div></div> : <p className={styles.hint}>{state.board || "还没有公告"}</p>}
      <div className={styles.sectionTitle}><strong>协作链接</strong><button className={shell.iconButton} type="button" disabled={!state.team || state.busy || state.links.length >= 16} aria-label="添加协作链接" onClick={addLink}><Plus size={14} /></button></div>
      {state.links.map((link, index) => <div className={styles.linkRow} key={`${link.url}-${index}`}><a href={link.url} target="_blank" rel="noreferrer">{link.title}</a><Button type="text" size="small" disabled={state.busy} onClick={() => void state.saveBoard(state.board, state.links.filter((_, i) => i !== index))}>移除</Button></div>)}
    </> },
    { key: "files", label: <span><Files size={14} /> 文件</span>, children: <><Button block disabled={!state.team} onClick={() => fileInput.current?.click()}>选择共享文件</Button><input hidden ref={fileInput} type="file" multiple onChange={(event) => state.setFiles((current) => [...current, ...Array.from(event.target.files ?? []).map((file) => ({ name: file.name, size: file.size }))])} />{state.files.map((file, index) => <div className={styles.linkRow} key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / 1024).toFixed(1)} KB</small></div>)}<p className={styles.hint}>仅展示文件清单，未上传或向成员共享。</p></> },
    { key: "transfers", label: <span><ArrowLeftRight size={14} /> 传输</span>, children: <div className={shell.empty}><ArrowLeftRight size={24} /><p>暂无传输任务</p></div> },
  ]} /></div>;
}
