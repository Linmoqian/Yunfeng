/* 共享参考文献库、全文阅读与证据笔记。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Input, Modal, Popconfirm } from "antd";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
import type { Reference } from "./model";
import styles from "./ResearchTools.module.css";
import { paperAssetAction, paperError } from "../services/paperAssets";
export function ReferenceLibrary() {
  const paper = usePaperContext();
  const references = paper.workspace.references ?? [];
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Reference | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  async function importFulltext(file: File) {
    if (!editing) return;
    setImporting(true);
    try {
      if (/\.pdf$/i.test(file.name)) {
        if (file.size > 20 * 1024 * 1024) throw new Error("PDF 最多 20 MiB");
        const result = await paperAssetAction<{id:string}>({ action: "importPdf", name: file.name, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
        setEditing({ ...editing, pdfAssetId: result.id });
      } else {
        if (file.size > 65536) throw new Error("全文最多 64 KiB");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
        if (text.includes("\0")) throw new Error("全文包含非文本内容");
        setEditing({ ...editing, text });
      }
      setError("");
    } catch (reason) { setError(paperError(reason)); }
    finally { setImporting(false); }
  }
  function save() {
    if (!editing?.title.trim()) { setError("请输入文献标题"); return; }
    if (editing.url && !/^https?:\/\//i.test(editing.url)) { setError("链接仅支持 HTTP 或 HTTPS"); return; }
    if (references.length >= 200 && !references.some((item) => item.id === editing.id)) { setError("最多保存 200 篇文献"); return; }
    paper.updateWorkspace({ references: references.some((item) => item.id === editing.id) ? references.map((item) => item.id === editing.id ? editing : item) : [...references, editing] });
    setEditing(null); setError("");
  }
  const bodies = [paper.workspace.body, paper.workspace.analysis?.body, paper.workspace.design?.body, paper.workspace.literature?.body];
  return <div className={styles.list}>
    <Input.Search placeholder="检索文献" aria-label="检索文献" value={search} onChange={(event) => setSearch(event.target.value)} />
    <Button ref={addButton} disabled={!paper.ready} icon={<Plus size={14} />} onClick={() => { setError(""); setEditing({ id: crypto.randomUUID(), title: "", citation: "", url: "", notes: "" }); }}>添加文献</Button>
    {references.filter((item) => `${item.title} ${item.citation}`.includes(search)).map((item) => <div key={item.id} className={styles.material}>
      <Button type="text" onClick={() => paper.setReading({ kind: "reference", id: item.id })}>{item.title}</Button>
      <div className={styles.bar}><Button type="text" aria-label={`编辑文献：${item.title}`} icon={<Pencil size={14} />} onClick={() => { setError(""); setEditing(item); }} />
        <Popconfirm title="移出这篇文献？" onConfirm={() => paper.updateWorkspace({ references: references.filter((ref) => ref.id !== item.id) })}><Button type="text" aria-label={`移出文献：${item.title}`} icon={<Trash2 size={14} />} disabled={bodies.some((body) => body?.includes(`[^ref-${item.id}]`))} /></Popconfirm>
        <Button size="small" onClick={() => paper.insert(`[^ref-${item.id}]`)}>引用</Button>
      </div>
    </div>)}
    <Modal title="参考文献" open={Boolean(editing)} afterClose={() => addButton.current?.focus()} keyboard={!importing} closable={!importing} maskClosable={!importing} cancelButtonProps={{disabled:importing}} okButtonProps={{disabled:importing}} onCancel={() => setEditing(null)} onOk={save} okText="保存" cancelText="取消">
      {editing && <div className={styles.sidebar}>{([['title','文献标题',200], ['citation','作者、年份与出处',1000], ['url','文献链接',2048]] as const).map(([key,label,maxLength]) => <label className={styles.field} key={key}>{label}<Input value={editing[key]} maxLength={maxLength} onChange={(event) => setEditing({ ...editing, [key]: event.target.value })} /></label>)}
        <label className={styles.field}>证据笔记<Input.TextArea rows={4} value={editing.notes} maxLength={16000} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
        <label className={styles.field}>导入全文<input type="file" disabled={importing} accept=".md,.txt,.pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value=""; if (file) void importFulltext(file); }} /></label>
        {editing.pdfAssetId && <p className={styles.muted}>PDF 已保存至本机素材库。</p>}
        {error && <p role="alert">{error}</p>}
      </div>}
    </Modal>
  </div>;
}
