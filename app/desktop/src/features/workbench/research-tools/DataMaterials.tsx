/* 文本数据摘录共享保存，来源可回读并插入文稿。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Input, Popconfirm } from "antd";
import { Database, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
import styles from "./ResearchTools.module.css";
export function DataMaterials() {
  const paper = usePaperContext();
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const files = paper.workspace.dataFiles ?? [];
  const bodies = [paper.workspace.body, paper.workspace.analysis?.body, paper.workspace.design?.body, paper.workspace.literature?.body];
  async function importFile(file: File) {
    setImporting(true);
    try {
      if (!/\.(csv|tsv|txt|json|md)$/i.test(file.name)) throw new Error("请选择 CSV、TSV、TXT、JSON 或 Markdown");
      if (file.size > 65536 || files.length >= 20) throw new Error("最多 20 份摘录，每份 64 KiB");
      const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (content.includes("\0")) throw new Error("摘录包含非文本内容");
      paper.updateWorkspace({ dataFiles: [...files, { id: crypto.randomUUID(), name: file.name.slice(0, 200), content }] }); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "摘录导入失败"); }
    finally { setImporting(false); }
  }
  return <div className={styles.list}>
    <Button type="text" icon={<Database size={15} strokeWidth={1.5} />} disabled={!paper.ready || importing} loading={importing} onClick={() => input.current?.click()}>添加数据摘录</Button>
    <input ref={input} hidden type="file" accept=".csv,.tsv,.txt,.json,.md" aria-label="添加数据摘录" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
    {files.map((file) => <div className={styles.material} key={file.id}><Button type="text" onClick={() => paper.setReading({ kind: "data", id: file.id })}>{file.name}</Button>
      <div className={styles.bar}><Button type="text" aria-label={`插入数据来源：${file.name}`} icon={<Plus size={14} />} onClick={() => paper.insert(`\n数据来源：[${file.name}](research-data:${file.id})。\n`)} />
        <Popconfirm title="移出这份摘录？" onConfirm={() => paper.updateWorkspace({ dataFiles: files.filter((item) => item.id !== file.id) })}><Button type="text" aria-label={`移出摘录：${file.name}`} icon={<Trash2 size={14} />} disabled={bodies.some((body) => body?.includes(`research-data:${file.id}`))} /></Popconfirm>
      </div>
    </div>)}
    <p className={styles.muted}>本机文本摘录，可记录分析方法和结果。统计计算需另行执行。</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
export function ReferenceNotes() {
  const paper = usePaperContext();
  const references = paper.workspace.references ?? [];
  const reference = references.find((item) => item.id === paper.selectedReferenceId);
  if (!reference) return <p className={styles.muted}>选择文献，记录证据并插入引用。</p>;
  return <div className={styles.list}><strong>{reference.title}</strong><Input.TextArea aria-label="证据笔记" value={reference.notes} maxLength={16000} rows={8} onChange={(event) => paper.updateWorkspace({ references: references.map((item) => item.id === reference.id ? { ...item, notes: event.target.value } : item) })} />
    <Button onClick={() => paper.insert(`\n${reference.notes}[^ref-${reference.id}]\n`)}>插入证据笔记</Button>
  </div>;
}
