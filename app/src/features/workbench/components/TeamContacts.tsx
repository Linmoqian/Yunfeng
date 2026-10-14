/* 本地团队的创建与恢复；远端成员由后续配对批次接入。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { App, Button, Input } from "antd";
import { ArrowLeft, Users } from "lucide-react";
import { useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";

export function TeamContacts({ state, onBack }: { state: TeamWorkspace; onBack: () => void }) {
  const { modal } = App.useApp();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const unavailable = !state.available || state.busy;
  return <div className={styles.pane} aria-label="团队通讯录">
    <button type="button" className={shell.navButton} onClick={onBack}><ArrowLeft size={15} /><span>返回工作区</span></button>
    <p className={styles.nodeStatus}>本地保存 · 尚未联网</p>
    {!state.available && <p className={shell.notice} role="status">请在 Yunfeng 原生桌面应用中使用团队功能。</p>}
    {state.snapshot && <details className={styles.card}><summary>本机安装标识</summary><p className={styles.hint}>{state.snapshot.installationId}</p><p className={styles.hint}>此标识不用于配对认证。</p></details>}
    {!state.team ? <>
      <details className={styles.card} open><summary>创建本地团队</summary><div className={styles.fields}>
        <label>团队名称<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
        <label>你的名称<Input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={80} /></label>
        <Button type="primary" loading={state.busy} disabled={unavailable || !name.trim() || !owner.trim()} onClick={() => void state.create(name, owner)}>创建团队</Button>
      </div></details>
      {!!state.snapshot?.savedTeams.length && <details className={styles.card} open><summary>本地团队</summary>{state.snapshot.savedTeams.map((team) => <Button key={team.id} type="text" block disabled={unavailable} onClick={() => void state.activate(team.id)}>{team.name}</Button>)}</details>}
    </> : <>
      <div className={styles.sectionTitle}><strong>{state.team.name}</strong></div>
      {state.team.members.map((member) => <div key={member} className={shell.navButton}><Users size={14} /><span>{member} · 你</span></div>)}
      <div className={styles.fields}><Button disabled={unavailable} onClick={() => void state.reload()}>重新读取本地数据</Button>
        <Button disabled={unavailable} onClick={() => modal.confirm({ title: "关闭本地团队？", content: "消息和公告会保留，可以从本地团队列表恢复。", okText: "关闭团队", cancelText: "取消", onOk: async () => { if (!await state.leave()) throw new Error("关闭失败，请查看行内提示"); } })}>关闭团队</Button>
      </div>
    </>}
    <details className={styles.card}><summary>配对与附近节点</summary><p className={styles.hint}>设备配对、邀请与网络发现将在下一批接入。</p><Button disabled>加入远端团队</Button></details>
  </div>;
}
