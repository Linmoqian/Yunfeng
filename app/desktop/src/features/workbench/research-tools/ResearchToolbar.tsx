/* 共享文稿格式工具栏。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Dropdown, Input, Tooltip } from "antd";
import { Bold, Italic, ChevronDown } from "lucide-react";
import { usePaperContext } from "../hooks/usePaperWriting";
import { RESEARCH_TOOLS } from "./model";
import styles from "./ResearchTools.module.css";
import { PaperOperations } from "../components/PaperOperations";
export function ResearchToolbar({ independent, focused, onFocus, onError }: { independent: boolean; focused: boolean; onFocus: () => void; onError: (text: string) => void }) {
  const paper = usePaperContext();
  const metadata = RESEARCH_TOOLS.find((tool) => tool.id === paper.active)!;
  const actions = [{ id: 'bold', label: '粗体', Icon: Bold }, { id: 'italic', label: '斜体', Icon: Italic }] as const;
  return <><header className={styles.header}>
    <div className={styles.identity}><strong>{metadata.label}</strong><Input aria-label="文稿标题" variant="borderless" value={paper.value.name} disabled={!paper.ready} placeholder="未命名文稿" onChange={(event) => paper.update({ name: Array.from(event.target.value).slice(0, 200).join("") })} /></div>
    <div className={styles.bar}>
      <PaperOperations independent={independent} focused={focused} onFocus={onFocus} onError={onError} />
    </div>
  </header>{paper.view === "编辑" && !paper.reading && !focused && <div className={styles.bar} aria-label="格式工具栏">
    {actions.map(({ id, label, Icon }) => <Tooltip title={label} key={id}><Button type="text" aria-label={label} icon={<Icon size={16} strokeWidth={1.5} />} disabled={!paper.ready} onMouseDown={(event) => event.preventDefault()} onClick={() => paper.format(id)} /></Tooltip>)}
    <Dropdown trigger={["click"]} menu={{ items: [{ key: "heading", label: "标题" }, { key: "list", label: "列表" }, { key: "quote", label: "引用" }, { type: "divider" }, { key: "undo", label: "撤销" }, { key: "redo", label: "重做" }], onClick: ({ key }) => { if (key === "undo") paper.undo(); else if (key === "redo") paper.redo(); else if (key === "heading" || key === "list" || key === "quote") paper.format(key); } }}><Tooltip title="更多格式"><Button type="text" aria-label="更多格式" disabled={!paper.ready} icon={<ChevronDown size={14} strokeWidth={1.5} />} /></Tooltip></Dropdown>
  </div>}</>;
}
