/* 四类文稿中央插槽，编辑与阅读交互迁移自 LianAgent。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Button, Segmented } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePaperContext } from "../hooks/usePaperWriting";
import { MAX_PAPER_BYTES, paperByteLength } from "../paperWriting";
import { PaperAssetImage } from "./PaperAssetImage";
import { ProgressCapsule } from "./ProgressCapsule";
import { ResearchToolbar } from "../research-tools/ResearchToolbar";
import { WritingEditor, type WritingEditorHandle } from "../research-tools/WritingEditor";
import { RESEARCH_TOOLS } from "../research-tools/model";
import { withCitations } from "../research-tools/documentEditing";
import { ReferencePdf } from "../research-tools/ReferencePdf";
import styles from "../research-tools/ResearchTools.module.css";
import paperStyles from "./PaperWriting.module.css";
export function PaperWriting({ independent = false }: { independent?: boolean }) {
  const paper = usePaperContext();
  const [notice, setNotice] = useState("");
  const [focused, setFocused] = useState(false);
  const editor = useRef<WritingEditorHandle>(null);
  const metadata = RESEARCH_TOOLS.find((tool) => tool.id === paper.active)!;
  const reference = paper.reading?.kind === "reference" ? paper.workspace.references?.find((item) => item.id === paper.reading?.id) : undefined;
  const data = paper.reading?.kind === "data" ? paper.workspace.dataFiles?.find((item) => item.id === paper.reading?.id) : undefined;
  useEffect(() => { editor.current?.setSelectionRange(...paper.selection); editor.current?.focus(); }, [paper.focusVersion]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") setFocused(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void paper.saveNow(); }
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  return <section data-agent-component="writing" className={styles.center} data-focus={focused || undefined} aria-label={metadata.label}>
    <ResearchToolbar independent={independent} focused={focused} onFocus={() => setFocused((value) => !value)} onError={setNotice} />
    {!focused && <Segmented aria-label="文稿视图" options={["编辑", "预览", ...(paper.reading ? ["来源"] : [])]} value={paper.reading ? "来源" : paper.view} onChange={(value) => { if (value !== "来源") { paper.setReading(null); paper.setView(String(value)); } }} />}
    <div className={styles.canvas} role="region" aria-label={paper.reading ? "来源阅读" : `${paper.view}视图`}>
      {paper.reading ? <div className={styles.reading}><h3>{reference?.title ?? data?.name}</h3><Button onClick={() => paper.insert(reference ? `[^ref-${reference.id}]` : `\n数据来源：[${data?.name}](research-data:${data?.id})。\n`)}>插入来源</Button>{reference?.pdfAssetId ? <ReferencePdf id={reference.pdfAssetId} title={reference.title} /> : <pre>{reference?.text || reference?.notes || data?.content || "尚未导入全文，可在右栏记录证据笔记。"}</pre>}</div>
        : paper.view === "编辑" ? paper.ready ? <WritingEditor key={paper.active} ref={editor} value={paper.value.body} label={`${metadata.label}正文`} placeholder={metadata.placeholder} onLimit={() => setNotice("文稿不能超过 64 KiB")} onUndo={paper.undo} onRedo={paper.redo} onFormat={paper.format} onSelect={paper.setSelection} onChange={(body, selection) => {
          if (paperByteLength(body) > MAX_PAPER_BYTES) { setNotice("文稿不能超过 64 KiB"); return; }
          paper.update({ body }); paper.setSelection(selection); setNotice("");
        }} /> : <p role="status">正在读取文稿…</p>
          : <article className={`${styles.reading} ${paperStyles.preview}`}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => /^(paper-asset:|research-data:|https?:|mailto:|#)/i.test(url) ? url : ""} components={{ a: ({ children, href }) => <a href={href} onClick={href?.startsWith("research-data:") ? (event) => { event.preventDefault(); paper.setReading({ kind: "data", id: href.slice(14) }); } : undefined} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({src,alt}) => <PaperAssetImage src={src} alt={alt} /> }}>{withCitations(paper.value.body, paper.workspace.references ?? []) || "编辑文稿后在这里预览。"}</ReactMarkdown></article>}
    </div>
    <footer className={styles.status}><ProgressCapsule label="文稿" current={Array.from(paper.value.body).length} unit="字符" /><span>{!isTauri() ? "浏览器预览，尚未持久化" : paper.syncing ? "正在保存…" : paper.error ? "保存失败" : paper.ready ? "已保存于本机" : "正在读取文稿…"}</span></footer>
    {notice && <p role="alert">{notice}</p>}
    {paper.error && <p role="alert">{paper.error}<Button size="small" onClick={paper.retry}>重试保存</Button></p>}
  </section>;
}
