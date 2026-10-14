/* 个人 Agent 的资源、文稿和设备视图；新增工具保存页面内状态。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { Button } from "antd";
import { Activity, ExternalLink } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { WORKBENCH_TOOLS } from "../workbenchTools";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";
import { DeviceProfile } from "./DeviceProfile";
const TerminalPanel = lazy(() => import("./TerminalPanel").then((module) => ({ default: module.TerminalPanel })));
import { SharedUtility } from "./SharedUtility";
import { isSharedComponent, openComponentWindow, sharingError } from "../services/componentSharing";

export function WorkspaceUtility({ id, title, independent = false }: { id: string; title: string; independent?: boolean }) {
  const [notice, setNotice] = useState("");
  const tool = WORKBENCH_TOOLS.find((item) => id === `tool-${item.id}`);
  const device = tool?.id === "devices" || id === "workbench-devices";
  const component = tool?.id ?? ((id === "resources" || id === "workbench-files") ? "resources" : "");
  const shared = isSharedComponent(component);
  if (id === "tool-terminal") return <Suspense fallback={<p role="status">正在加载终端…</p>}><TerminalPanel /></Suspense>;
  return <section className={styles.resourceStage} aria-label={title}>
    <header className={styles.sectionTitle}><h1>{title}</h1><span>{device ? "Rust 本机档案" : shared ? "共享组件" : "前端交互预览"}</span>
      {shared && !independent && <Button icon={<ExternalLink size={15} />} onClick={() => { void openComponentWindow(component).catch((reason) => setNotice(sharingError(reason))); }}>独立窗口</Button>}
    </header>
    {shared && <SharedUtility component={component} />}
    {device && <DeviceProfile />}
    {tool?.id === "resourceMonitor" && <div className={shell.empty}><Activity size={32} /><h3>计算机资源</h3><p>等待接入现有服务的设备指标。</p></div>}
    {notice && <p className={shell.notice} role="status">{notice}</p>}
    {!device && !shared && <p className={styles.hint}>此视图只保存当前界面的交互状态。</p>}
  </section>;
}
