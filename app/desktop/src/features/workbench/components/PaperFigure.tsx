/* 图片素材的预览、图注、插入与可恢复归档。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Input } from "antd";
import { useEffect, useState } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
import { assetMarkdown, type PaperAsset } from "../services/paperAssets";
import { MAX_PAPER_BYTES, paperByteLength } from "../paperWriting";
import { PaperAssetImage } from "./PaperAssetImage";
import styles from "./PaperWriting.module.css";
export function PaperFigure({ asset }: { asset: PaperAsset }) {
  const paper = usePaperContext();
  const [caption, setCaption] = useState(asset.caption);
  useEffect(() => setCaption(asset.caption), [asset.caption]);
  const next = paper.value.body + assetMarkdown({ ...asset, caption });
  return <article className={styles.figure}><PaperAssetImage src={`paper-asset:${asset.id}`} alt={asset.name} />
    <strong>{asset.name}</strong><small>{asset.width} × {asset.height} · {(asset.size/1024).toFixed(0)} KiB</small>
    <Input aria-label={`图注：${asset.name}`} placeholder="填写图注…" value={caption} maxLength={500} onChange={(event) => setCaption(event.target.value)} />
    <Button size="small" disabled={paper.materials.busy || caption === asset.caption} onClick={() => { void paper.materials.act({action:"caption",id:asset.id,caption}); }}>保存图注</Button>
    <Button disabled={!paper.ready || paperByteLength(next) > MAX_PAPER_BYTES} onClick={() => { paper.update({body:next}); paper.setView("编辑"); }}>插入正文</Button>
    <Button size="small" disabled={paper.materials.busy} onClick={() => { void paper.materials.act({action:asset.archived ? "restore" : "archive",id:asset.id}); }}>{asset.archived ? "恢复素材" : "移出素材"}</Button>
  </article>;
}
