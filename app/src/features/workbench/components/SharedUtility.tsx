/* 文稿和资源复用同一视图，Rust 快照在主界面与独立窗口之间同步。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Segmented } from "antd";
import { FolderOpen } from "lucide-react";
import { useRef } from "react";
import { useSharedComponent } from "../hooks/useSharedComponent";
import type { SharedComponentId } from "../services/componentSharing";
import styles from "./UtilityPanels.module.css";
import shell from "./WorkspaceShell.module.css";
import { PaperWriting } from "./PaperWriting";

function Resources() {
  const shared = useSharedComponent("resources");
  const input = useRef<HTMLInputElement>(null);
  const { view, files } = shared.value;
  return <>
    <Segmented disabled={!shared.ready} options={["文件", "图片", "视频", "结果"]} value={view} onChange={(value) => shared.update({ view: String(value) })} />
    <div className={styles.fields}><Button disabled={!shared.ready} icon={<FolderOpen size={15} />} onClick={() => input.current?.click()}>选择{view === "结果" ? "文件" : view}</Button>
      <input hidden type="file" multiple ref={input} accept={view === "图片" ? "image/*" : view === "视频" ? "video/*" : undefined} onChange={(event) => { shared.update({ files: [...files, ...Array.from(event.target.files ?? []).map((file) => ({ name: file.name, size: file.size }))] }); event.target.value = ""; }} /></div>
    <div className={styles.resourcesGrid}>{files.map((file, index) => <article className={styles.resourceItem} key={`${file.name}-${index}`}><FolderOpen size={24} /><h3>{file.name}</h3><p className={styles.hint}>{(file.size / 1024).toFixed(1)} KB</p><Button size="small" onClick={() => shared.update({ files: files.filter((_, i) => i !== index) })}>移除</Button></article>)}</div>
    {!files.length && <div className={shell.empty}><FolderOpen size={36} /><p>选择文件后显示资源清单</p></div>}
    <p className={styles.hint}>共享文件名称与大小；文件内容未上传。</p>
    {shared.error && <p role="alert">{shared.error}<Button onClick={shared.retry}>重试同步</Button></p>}
  </>;
}
export function SharedUtility({ component }: { component: SharedComponentId }) {
  return component === "writing" ? <PaperWriting /> : <Resources />;
}
