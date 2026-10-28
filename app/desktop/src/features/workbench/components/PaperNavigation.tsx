/* 四个研究工具通过共享左栏切换来源和章节。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Select, Segmented } from "antd";
import { ArrowLeft, FileText } from "lucide-react";
import { useState } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
import { paperOutline } from "../paperWriting";
import { RESEARCH_TOOLS, OUTLINES, type ResearchToolId } from "../research-tools/model";
import { ReferenceLibrary } from "../research-tools/ReferenceLibrary";
import styles from "../research-tools/ResearchTools.module.css";
export function PaperNavigation({ onBack, onTool }: { onBack?: () => void; onTool?: (tool: ResearchToolId) => void }) {
  const paper = usePaperContext();
  const [section, setSection] = useState("文献");
  const bibliography = paper.active === "writing" || paper.active === "literature";
  function jump(line: number) {
    const offset = paper.value.body.split("\n").slice(0, line).join("\n").length + (line ? 1 : 0);
    paper.setReading(null); paper.setView("编辑"); paper.setSelection([offset, offset]); paper.focusEditor();
  }
  return <aside className={styles.sidebar} aria-label="研究工具导航">
    <div className={styles.bar}>{onBack && <Button type="text" aria-label="返回工作区" icon={<ArrowLeft size={14} />} onClick={onBack} />}
      <Select aria-label="研究工具" value={paper.active} style={{ flex: 1, minWidth: 120 }} options={RESEARCH_TOOLS.map((tool) => ({ value: tool.id, label: tool.label }))} onChange={(tool) => { if (onTool) onTool(tool); else paper.open(tool); }} />
    </div>
    {bibliography && <Segmented options={["文献", "章节"]} value={section} onChange={(value) => setSection(String(value))} />}
    {bibliography && section === "文献" ? <ReferenceLibrary /> : <div className={styles.list}>
      {paperOutline(paper.value.body).map((heading) => <Button type="text" icon={<FileText size={14} />} key={heading.line} onClick={() => jump(heading.line)}>{heading.title}</Button>)}
      {!paper.value.body && <Button disabled={!paper.ready} onClick={() => paper.insert(OUTLINES[paper.active])}>建立提纲</Button>}
    </div>}
    {paper.active === "design" && <p className={styles.muted}>记录方案、重复、随机化和采集流程；统计设计需另行核对。</p>}
  </aside>;
}
