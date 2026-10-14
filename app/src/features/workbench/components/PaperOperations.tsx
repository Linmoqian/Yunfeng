/* 文稿导入、提纲与 Markdown 导出操作。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Popconfirm } from "antd";
import { Download, ListTree, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
import { decodePaperFile, MAX_PAPER_BYTES, PAPER_TEMPLATE, paperFilename } from "../paperWriting";
import styles from "./PaperWriting.module.css";
export function PaperOperations() {
  const paper = usePaperContext();
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const disabled = !paper.ready || importing;
  async function importFile(file: File) {
    setImporting(true); setNotice("");
    try {
      if (file.size > MAX_PAPER_BYTES) throw new Error("文稿不能超过 64 KiB");
      paper.update(decodePaperFile(file.name, await file.arrayBuffer())); paper.setView("编辑");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "文稿导入失败"); }
    finally { setImporting(false); }
  }
  function exportFile() {
    const url = URL.createObjectURL(new Blob([paper.value.body], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = paperFilename(paper.value.name);
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function template() { paper.update({ body: PAPER_TEMPLATE }); paper.setView("编辑"); }
  return <section className={styles.referenceForm} aria-label="文稿操作"><h3>文稿操作</h3>
    {paper.value.body ? <Popconfirm title="用论文提纲替换当前正文？" onConfirm={template} okText="替换" cancelText="取消"><Button disabled={disabled} icon={<ListTree size={14} />}>建立提纲</Button></Popconfirm>
      : <Button disabled={disabled} icon={<ListTree size={14} />} onClick={template}>建立提纲</Button>}
    <Popconfirm title="导入将替换当前文稿" disabled={!paper.value.body || disabled} onConfirm={() => input.current?.click()} okText="选择文件" cancelText="取消"><Button disabled={disabled} loading={importing} icon={<Upload size={14} />} onClick={() => { if (!paper.value.body) input.current?.click(); }}>导入文稿</Button></Popconfirm>
    <Button disabled={disabled || !paper.value.body || paper.syncing || Boolean(paper.error)} icon={<Download size={14} />} onClick={exportFile}>导出 Markdown</Button>
    <input hidden ref={input} type="file" accept=".md,.markdown" aria-label="导入 Markdown 文稿" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
    {notice && <p role="alert">{notice}</p>}
  </section>;
}
