/* 写作中央插槽；分栏布局与导航由 WorkspaceShell 统一管理。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Button, Input, Segmented } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePaperContext } from "../hooks/usePaperWriting";
import { MAX_PAPER_BYTES, paperByteLength } from "../paperWriting";
import { openComponentWindow, sharingError } from "../services/componentSharing";
import styles from "./PaperWriting.module.css";
import { PaperAssetImage } from "./PaperAssetImage";
import { ProgressCapsule } from "./ProgressCapsule";
export function PaperWriting({ independent = false }: { independent?: boolean }) {
  const paper = usePaperContext();
  const [notice, setNotice] = useState("");
  const id = useId();
  return <section data-agent-component="writing" className={styles.document} aria-label="论文写作">
    <div className={styles.toolbar}><strong>论文写作</strong>{!independent && <Button size="small" icon={<ExternalLink size={14} />} onClick={() => { void openComponentWindow("writing").catch((reason) => setNotice(sharingError(reason))); }}>独立窗口</Button>}</div>
    <label className={styles.title}>文稿标题<Input value={paper.value.name} disabled={!paper.ready} onChange={(event) => paper.update({ name: Array.from(event.target.value).slice(0, 200).join("") })} placeholder="未命名论文" /></label>
    <Segmented aria-label="论文写作视图" options={["编辑", "预览"]} value={paper.view} onChange={(value) => paper.setView(String(value))} />
    <div className={`${styles.canvas} ${paper.view === "编辑" ? styles.editor : ""}`} role="region" aria-label={`${paper.view}视图`}>
      {paper.view === "编辑" ? <label htmlFor={id}>Markdown 草稿<Input.TextArea id={id} disabled={!paper.ready} value={paper.value.body} spellCheck={false} placeholder="写下研究问题、方法和结果…" onChange={(event) => {
        if (paperByteLength(event.target.value) > MAX_PAPER_BYTES) { setNotice("文稿不能超过 64 KiB"); return; }
        paper.update({ body: event.target.value }); setNotice("");
      }} /></label> : <article className={styles.preview}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => url.startsWith("paper-asset:") ? url : /^(https?:|mailto:|#)/i.test(url) ? url : ""} components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({src,alt}) => <PaperAssetImage src={src} alt={alt} /> }}>{paper.value.body || "编辑文稿后在这里预览。"}</ReactMarkdown></article>}
    </div>
    <footer className={styles.status}><span><ProgressCapsule label="文稿" current={Array.from(paper.value.body).length} unit="字符" /> · {(paperByteLength(paper.value.body) / 1024).toFixed(1)} / 64 KiB</span><span>{!isTauri() ? "浏览器预览，尚未持久化" : paper.syncing ? "正在保存…" : paper.error ? "保存失败" : paper.ready ? "已保存于本机" : "正在读取文稿…"}</span></footer>
    {notice && <p role="alert">{notice}</p>}
    {paper.error && <p role="alert">{paper.error}<Button size="small" onClick={paper.retry}>重试保存</Button></p>}
  </section>;
}
