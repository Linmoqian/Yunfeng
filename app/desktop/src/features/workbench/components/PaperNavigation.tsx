/* 写作导航通过现有 DockPanel 展示参考文献与章节。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Segmented } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
import { paperOutline } from "../paperWriting";
import { PaperReferences } from "./PaperReferences";
import styles from "./PaperWriting.module.css";
export function PaperNavigation({ onBack }: { onBack?: () => void }) {
  const paper = usePaperContext();
  const [section, setSection] = useState("章节");
  return <aside className={styles.sidebar} aria-label="写作导航">
    {onBack && <Button size="small" icon={<ArrowLeft size={14} />} onClick={onBack}>返回工作区</Button>}
    <Segmented options={["文献", "章节"]} value={section} onChange={(value) => setSection(String(value))} />
    {section === "文献" ? <PaperReferences body={paper.value.body} disabled={!paper.ready} onChange={(body) => paper.update({ body })} />
      : <ol className={styles.outline}>{paperOutline(paper.value.body).map((heading) => <li key={heading.line} style={{ paddingInlineStart: (heading.level - 1) * 10 }}>{heading.title}</li>)}</ol>}
    <p>{isTauri() ? "文稿自动保存于本机。" : "浏览器提供编辑预览，原生应用负责保存。"}</p>
  </aside>;
}
