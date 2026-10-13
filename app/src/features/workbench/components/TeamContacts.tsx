/* 团队交互预览沿用 LianAgent 布局，状态驻留前端。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { App, Button, Input } from "antd";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { useState } from "react";
import type { TeamPreview } from "../hooks/useTeamPreview";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";

export function TeamContacts({ state, onBack }: { state: TeamPreview; onBack: () => void }) {
  const { modal } = App.useApp();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [invitation, setInvitation] = useState("");
  const [selected, setSelected] = useState("");
  function join() {
    try {
      const data = JSON.parse(invitation) as { name?: string; members?: string[] };
      if (typeof data.name !== "string" || !data.name.trim() || !owner.trim() || (data.members !== undefined && (!Array.isArray(data.members) || data.members.some((member) => typeof member !== "string")))) throw new Error();
      modal.confirm({ title: "加入团队", content: `在当前界面预览加入“${data.name}”。网络同步尚未接入。`, okText: "预览加入", cancelText: "取消",
        onOk: () => { state.setTeam({ name: data.name!, owner: owner.trim(), members: [owner.trim(), ...(data.members ?? [])] }); state.setRunning(true); state.setNotice("已进入团队交互预览"); } });
    } catch { state.setNotice("邀请格式无效，请完整粘贴预览邀请信息"); }
  }
  return <div className={styles.pane} aria-label="团队通讯录">
    <button type="button" className={shell.navButton} onClick={onBack}><ArrowLeft size={15} /><span>返回工作区</span></button>
    <p className={styles.nodeStatus} data-running={state.running}>{state.running ? "本机节点 · 交互预览" : "本机节点已停止"}</p>
    {!state.team ? <>
      <details className={styles.card} open><summary>创建团队</summary><div className={styles.fields}>
        <label>团队名称<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
        <label>你的名称<Input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={80} /></label>
        <Button type="primary" disabled={!name.trim() || !owner.trim()} onClick={() => { state.setTeam({ name: name.trim(), owner: owner.trim(), members: [owner.trim()] }); state.setRunning(true); state.setNotice("团队已在当前界面创建。网络同步尚未接入。"); }}>创建团队</Button>
      </div></details>
      <details className={styles.card}><summary>加入团队</summary><div className={styles.fields}>
        <label>你的名称<Input value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
        <label>邀请信息<Input.TextArea placeholder="粘贴完整预览邀请" value={invitation} onChange={(event) => setInvitation(event.target.value)} rows={3} /></label>
        <Button disabled={!owner.trim() || !invitation.trim()} onClick={join}>加入团队</Button>
      </div></details>
    </> : <>
      <div className={styles.sectionTitle}><strong>{state.team.name}</strong><button type="button" className={shell.iconButton} aria-label="添加团队成员" onClick={() => {
        let member = ""; modal.confirm({ title: "添加成员预览", icon: null, content: <Input aria-label="成员名称" onChange={(event) => { member = event.target.value; }} />, okText: "添加", cancelText: "取消",
          onOk: () => { if (member.trim()) state.setTeam((current) => current && ({ ...current, members: [...current.members, member.trim()] })); } });
      }}><Plus size={14} /></button></div>
      {state.team.members.map((member, index) => <button type="button" key={`${member}-${index}`} className={shell.navButton} data-active={member === selected || undefined} onClick={() => setSelected(member)}><Users size={14} /><span>{member}{index === 0 ? " · 你" : ""}</span></button>)}
      <div className={styles.fields}><Button onClick={() => state.setRunning(!state.running)}>{state.running ? "停止本机节点" : "启动本机节点"}</Button>
        <Button onClick={() => { void navigator.clipboard.writeText(JSON.stringify({ name: state.team!.name, members: state.team!.members })).then(() => state.setNotice("预览邀请已复制"), () => state.setNotice("复制失败，请检查剪贴板权限")); }}>复制邀请信息</Button>
        <Button danger onClick={() => modal.confirm({ title: "离开团队预览？", okText: "离开", cancelText: "取消", onOk: () => { state.setTeam(null); state.setRunning(false); state.setMessages([]); state.setBoard(""); state.setLinks([]); state.setFiles([]); state.setNotice(""); } })}>离开团队</Button>
      </div>
    </>}
    <details className={styles.card}><summary>附近节点 <small>0</small></summary><p className={styles.hint}>此预览未连接局域网节点。</p></details>
  </div>;
}
