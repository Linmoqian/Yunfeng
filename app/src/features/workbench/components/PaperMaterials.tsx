/* 写作右栏内容通过共享工作台插槽展示。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { PaperOperations } from "./PaperOperations";
import styles from "./PaperWriting.module.css";
import { Button, Checkbox } from "antd";
import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
import { PaperFigure } from "./PaperFigure";
export function PaperMaterials() {
  const { materials } = usePaperContext();
  const input = useRef<HTMLInputElement>(null);
  const [archived,setArchived] = useState(false);
  return <aside className={styles.sidebar} aria-label="图文素材"><PaperOperations />
    <Button loading={materials.busy} icon={<ImagePlus size={16} />} onClick={() => input.current?.click()}>添加图片</Button>
    <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label="添加论文图片" onChange={(event) => { const file=event.target.files?.[0]; event.target.value=""; if (file) void materials.importFile(file); }} />
    <p>PNG、JPEG、WebP，每张最多 20 MiB、1600 万像素。</p>
    <Checkbox checked={archived} onChange={(event) => setArchived(event.target.checked)}>显示已移出的素材</Checkbox>
    {materials.assets.filter((asset) => archived || !asset.archived).map((asset) => <PaperFigure asset={asset} key={asset.id} />)}
    {materials.error && <p role="alert">{materials.error}<Button size="small" onClick={() => { void materials.refresh(); }}>刷新</Button></p>}
  </aside>;
}
