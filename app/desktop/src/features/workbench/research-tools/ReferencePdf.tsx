/* 仅在阅读时加载已保存的本机 PDF，不访问远程页面。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { useEffect } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
export function ReferencePdf({ id, title }: { id: string; title: string }) {
  const { materials } = usePaperContext();
  useEffect(() => { void materials.load(id); }, [id]);
  const url = materials.urls[id];
  return url ? <object type="application/pdf" data={url} aria-label={`${title}全文`} style={{width:"100%",height:"65vh"}}><p>当前系统不能内嵌显示 PDF。</p></object> : <p role="status">{materials.error || "正在读取 PDF…"}</p>;
}
