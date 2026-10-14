/* 参考文献录入到 Markdown 正文，复用文稿共享状态。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Input } from "antd";
import { useState } from "react";
import { MAX_PAPER_BYTES, paperByteLength } from "../paperWriting";
import styles from "./PaperWriting.module.css";

export function PaperReferences({ body, disabled, onChange }: { body: string; disabled: boolean; onChange: (body: string) => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  function insert() {
    let parsed: URL;
    try { parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); }
    catch { setError("请输入完整的 HTTP 或 HTTPS 文献链接"); return; }
    const label = title.trim().replace(/[\[\]\\]/g, "\\$&").replace(/\r?\n/g, " ");
    const citation = `- [${label}](<${parsed.href.replace(/>/g, "%3E")}>)\n`;
    const section = body.match(/^##[ \t]+参考文献[ \t]*$/m);
    const position = section ? (section.index ?? 0) + section[0].length : body.length;
    const next = section ? `${body.slice(0, position)}\n\n${citation}${body.slice(position)}` : `${body}\n\n## 参考文献\n\n${citation}`;
    if (paperByteLength(next) > MAX_PAPER_BYTES) { setError("文稿已达到 64 KiB 上限"); return; }
    onChange(next); setTitle(""); setUrl(""); setError("");
  }
  return <section className={styles.referenceForm} aria-label="参考文献管理"><h3>参考文献</h3>
    <p>录入已核对的文献，引用会添加到正文的参考文献章节。</p>
    <label>文献标题<Input value={title} maxLength={200} disabled={disabled} onChange={(event) => setTitle(event.target.value)} placeholder="文献题目" /></label>
    <label>文献链接<Input value={url} maxLength={2048} disabled={disabled} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
    <Button disabled={disabled || !title.trim() || !url.trim()} onClick={insert}>插入参考文献</Button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
