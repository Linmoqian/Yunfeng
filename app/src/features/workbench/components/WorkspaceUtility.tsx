/* 个人 Agent 的资源、文稿和设备视图；新增工具保存页面内状态。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { Button, Input, Segmented } from "antd";
import { Activity, FolderOpen, MonitorSmartphone } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { WORKBENCH_TOOLS } from "../workbenchTools";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";

const TerminalPanel = lazy(() => import("./TerminalPanel").then((module) => ({ default: module.TerminalPanel })));
export function WorkspaceUtility({ id, title }: { id: string; title: string }) {
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [view, setView] = useState("文件");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [records, setRecords] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const tool = WORKBENCH_TOOLS.find((item) => id === `tool-${item.id}`);
  if (id === "tool-terminal") return <Suspense fallback={<p role="status">正在加载终端…</p>}><TerminalPanel /></Suspense>;
  return <section className={styles.resourceStage} aria-label={title}>
    <header className={styles.sectionTitle}><h1>{title}</h1><span>前端交互预览</span></header>
    {(id === "resources" || id === "workbench-files" || tool?.id === "resources") && <>
      <Segmented options={["文件", "图片", "视频", "结果"]} value={view} onChange={(value) => setView(String(value))} />
      <div className={styles.fields}><Button icon={<FolderOpen size={15} />} onClick={() => input.current?.click()}>选择{view === "结果" ? "文件" : view}</Button>
      <input hidden type="file" multiple ref={input} accept={view === "图片" ? "image/*" : view === "视频" ? "video/*" : undefined} onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files ?? []).map((file) => ({ name: file.name, size: file.size }))])} /></div>
      <div className={styles.resourcesGrid}>{files.map((file, index) => <article className={styles.resourceItem} key={`${file.name}-${index}`}><FolderOpen size={24} /><h3>{file.name}</h3><p className={styles.hint}>{(file.size / 1024).toFixed(1)} KB</p><Button size="small" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>移除</Button></article>)}</div>
      {!files.length && <div className={shell.empty}><FolderOpen size={36} /><p>选择文件后显示资源清单</p></div>}
    </>}
    {tool?.id === "writing" && <div className={styles.fields}><label>文稿标题<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="记录一个想法" /></label>
      <label>正文<Input.TextArea value={body} onChange={(event) => { setBody(event.target.value); setNotice(""); }} autoSize={{ minRows: 12, maxRows: 24 }} placeholder="在这里整理笔记、文稿与参考资料" /></label>
      <div className={styles.buttonRow}><Button onClick={() => { setName(""); setBody(""); setNotice(""); }}>新建文稿</Button><Button type="primary" disabled={!body.trim()} onClick={() => setNotice("文稿已保留在当前标签中，关闭标签后清除")}>保留草稿</Button></div>
    </div>}
    {(tool?.id === "devices" || id === "workbench-devices") && <div className={styles.card}><MonitorSmartphone size={24} /><h3>个人设备</h3>
      <div className={styles.fields}><label>设备名称<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：工作电脑" /></label>
        <Button disabled={!name.trim()} onClick={() => { setRecords((current) => [...current, name.trim()]); setName(""); }}>添加设备条目</Button>
      </div>{records.map((record, index) => <div className={styles.linkRow} key={`${record}-${index}`}><span>{record} · 未连接</span><Button size="small" onClick={() => setRecords((current) => current.filter((_, i) => i !== index))}>移除</Button></div>)}
      <p className={styles.hint}>设备条目仅用于前端预览，尚未接入连接服务。</p>
    </div>}
    {tool?.id === "resourceMonitor" && <div className={shell.empty}><Activity size={32} /><h3>计算机资源</h3><p>等待接入现有服务的设备指标。</p></div>}
    {notice && <p className={shell.notice} role="status">{notice}</p>}
    <p className={styles.hint}>此视图只保存当前界面的交互状态。</p>
  </section>;
}
