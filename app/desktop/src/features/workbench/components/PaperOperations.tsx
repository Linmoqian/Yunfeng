/* 文稿导入、提纲与 Markdown 导出操作。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Dropdown, Modal, Tooltip } from "antd";
import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
import { decodePaperFile, MAX_PAPER_BYTES, paperFilename } from "../paperWriting";
import styles from "./PaperWriting.module.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { paperError } from "../services/paperAssets";
import { OUTLINES } from "../research-tools/model";
import { withCitations } from "../research-tools/documentEditing";
import { openComponentWindow } from "../services/componentSharing";
export function PaperOperations({ independent, focused, onFocus, onError }: { independent: boolean; focused: boolean; onFocus: () => void; onError: (text: string) => void }) {
  const paper = usePaperContext();
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modal, contextHolder] = Modal.useModal();
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
    const url = URL.createObjectURL(new Blob([withCitations(paper.value.body, paper.workspace.references ?? [])], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = paperFilename(paper.value.name);
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function template() { paper.insert(OUTLINES[paper.active]); paper.setView("编辑"); }
  async function exportNative(format: string) {
    setExporting(true); setNotice("");
    try {
      if (!isTauri()) throw new Error("导出需要 Tauri 原生应用");
      const saved = await invoke<boolean>("paper_export_pdf", { tool: paper.active, format });
      setNotice(saved ? "文稿已保存" : "已取消导出");
    } catch (reason) { setNotice(paperError(reason)); }
    finally { setExporting(false); }
  }
  function act(key: string) {
    if (key === "import") {
      if (!paper.value.body) input.current?.click();
      else modal.confirm({ title: "导入将替换当前文稿", okText: "选择文件", cancelText: "取消", onOk: () => input.current?.click() });
    } else if (key === "save") void paper.saveNow();
    else if (key === "outline") template();
    else if (key === "copy") void navigator.clipboard.writeText(paper.value.body).catch(() => onError("复制失败"));
    else if (key === "window") void openComponentWindow("writing").catch(() => onError("独立窗口打开失败"));
    else if (key === "focus") onFocus();
    else if (key === "md" && !isTauri()) exportFile();
    else void exportNative(key);
  }
  return <section className={styles.actions} aria-label="文稿操作">
    {contextHolder}
    <Dropdown trigger={["click"]} menu={{ items: [
      { key: "import", label: "导入文稿" },
      { key: "export", label: "导出", disabled: !paper.value.body || paper.syncing || Boolean(paper.error), children: [{ key: "md", label: "Markdown" }, { key: "pdf", label: "PDF" }, { key: "docx", label: "Word" }, { key: "zip", label: "完整文稿包" }] },
      { key: "save", label: "保存文稿" }, { key: "outline", label: "插入提纲" }, { key: "copy", label: "复制文稿", disabled: !paper.value.body },
      { type: "divider" }, ...(!independent ? [{ key: "window", label: "独立窗口" }] : []), { key: "focus", label: focused ? "退出专注写作" : "专注写作" },
    ], onClick: ({ key }) => act(key) }}><Tooltip title="文稿操作"><Button type="text" aria-label="文稿操作" disabled={disabled || exporting} loading={importing || exporting} icon={<MoreHorizontal size={18} strokeWidth={1.5} />} /></Tooltip></Dropdown>
    <input hidden ref={input} type="file" accept=".md,.markdown" aria-label="导入 Markdown 文稿" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
    {notice && <p role="alert">{notice}</p>}
  </section>;
}
