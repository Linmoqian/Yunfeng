/* 节点连接入口；凭据由原生目录选择器交给 Rust，前端只接触地址与连接结果。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Input } from "antd";
import { Link, Unplug } from "lucide-react";
import { useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import styles from "./TeamWorkspace.module.css";

export function TeamNodeConnection({ state }: { state: TeamWorkspace }) {
  const [address, setAddress] = useState("http://127.0.0.1:19001");
  if (state.connectionLost && !state.connection) return <div className={styles.nodeConnection}>
    <p className={styles.hint}>团队服务暂不可达，正在自动重试。</p>
    <Button type="text" size="small" disabled={state.busy} icon={<Unplug size={13} />} onClick={() => void state.disconnect()}>返回本地团队</Button>
  </div>;
  return state.connection ? <div className={styles.nodeConnection}>
    <strong>{state.connection.name}</strong><small>{state.connection.address}</small>
    <p className={styles.hint}>{state.connectionLost ? "连接中断，正在自动重试。已有内容保留。" : "成员状态与直属关系自动同步。"}</p>
    <Button type="text" size="small" disabled={state.busy} icon={<Unplug size={13} />} onClick={() => void state.disconnect()}>断开节点</Button>
  </div> : <form className={styles.fields} onSubmit={(event) => { event.preventDefault(); if (address.trim()) void state.connect(address.trim()); }}>
    <label>节点地址<Input aria-label="节点地址" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="http://127.0.0.1:19001" maxLength={100} /></label>
    <p className={styles.hint}>选择该节点的数据目录后连接。仅支持本机节点。</p>
    <Button className={styles.createButton} size="small" htmlType="submit" disabled={!state.available || !address.trim()} loading={state.busy} icon={<Link size={13} />}>选择目录并连接</Button>
  </form>;
}
