/* Rust 本机档案；安装 UUID 不代表已配对或已认证设备。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button } from "antd";
import { MonitorSmartphone } from "lucide-react";
import { useTeamWorkspace } from "../hooks/useTeamWorkspace";
import styles from "./UtilityPanels.module.css";

export function DeviceProfile() {
  const state = useTeamWorkspace(true);
  return <div className={styles.card} aria-label="本机设备档案">
    <MonitorSmartphone size={24} /><h3>本机设备档案</h3>
    <p className={styles.hint}>{state.available ? "安装标识由 Rust 持久化，重启后保留。" : "请在 Yunfeng 原生桌面应用中读取本机档案。"}</p>
    {state.snapshot && <p className={styles.hint}>安装标识：{state.snapshot.installationId}</p>}
    <Button loading={state.busy} disabled={!state.available || state.busy} onClick={() => void state.reload()}>重新读取本机档案</Button>
    {state.notice && <p className={styles.hint} role="status">{state.notice}</p>}
    <p className={styles.hint}>当前没有配对网络。认证身份、短期配对票据与发现服务将在第二批接入。</p>
  </div>;
}
