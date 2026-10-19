/* 公告与链接保存到 Rust；文件选择仍只展示本地清单。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { App, Button, Input, Tabs } from "antd";
import { ArrowLeftRight, Files, Megaphone, Plus } from "lucide-react";
import { useRef } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";
import team from "./TeamWorkspace.module.css";
import { TeamNoticeBoard } from "./TeamNoticeBoard";

export function TeamWorkbench({ state }: { state: TeamWorkspace }) {
  const { modal } = App.useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  function addLink() {
    let title = "", url = "";
    modal.confirm({ title: "添加协作链接", icon: null, content: <div className={styles.fields}><Input aria-label="链接标题" placeholder="标题" onChange={(event) => { title = event.target.value; }} /><Input aria-label="链接地址" placeholder="https://" onChange={(event) => { url = event.target.value; }} /></div>, okText: "添加", cancelText: "取消", onOk: () => {
      if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error("请输入 HTTP 或 HTTPS 链接"));
      return state.saveBoard(state.board, [...state.links, { title: title.trim() || url, url }]).then((saved) => { if (!saved) throw new Error("保存失败，请查看行内提示"); });
    } });
  }
  return <div className={`${styles.pane} ${team.workbench}`}><Tabs defaultActiveKey="board" size="small" items={[
    { key: "board", label: <span><Megaphone size={14} /> 公告</span>, children: <>
      <TeamNoticeBoard key={state.team?.id ?? "empty"} state={state} />
      <div className={styles.sectionTitle}><strong>协作链接</strong><button className={shell.iconButton} type="button" disabled={!state.team || state.busy || state.links.length >= 16 || state.canEditBoard === false} aria-label="添加协作链接" onClick={addLink}><Plus size={14} /></button></div>
      {state.links.map((link, index) => <div className={styles.linkRow} key={`${link.url}-${index}`}><a href={link.url} target="_blank" rel="noreferrer">{link.title}</a><Button type="text" size="small" disabled={state.busy || state.canEditBoard === false} onClick={() => void state.saveBoard(state.board, state.links.filter((_, i) => i !== index))}>移除</Button></div>)}
    </> },
    { key: "files", label: <span><Files size={14} /> 文件</span>, children: <><Button block disabled={!state.team} onClick={() => fileInput.current?.click()}>选择共享文件</Button><input hidden ref={fileInput} type="file" multiple onChange={(event) => state.setFiles((current) => [...current, ...Array.from(event.target.files ?? []).map((file) => ({ name: file.name, size: file.size }))])} />{state.files.map((file, index) => <div className={styles.linkRow} key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / 1024).toFixed(1)} KB</small></div>)}<p className={styles.hint}>仅展示文件清单，未上传或向成员共享。</p></> },
    { key: "transfers", label: <span><ArrowLeftRight size={14} /> 传输</span>, children: <div className={shell.empty}><ArrowLeftRight size={24} /><p>暂无传输任务</p></div> },
  ]} /></div>;
}
