/* 只预览 Rust 管理的图片；不读取远程 URL 或任意本地文件。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { useEffect } from "react";
import { usePaperContext } from "../hooks/usePaperWriting";
export function PaperAssetImage({ src, alt }: { src?: string; alt?: string }) {
  const { materials } = usePaperContext();
  const id = src?.match(/^paper-asset:([0-9a-f-]{36})$/)?.[1];
  useEffect(() => { if (id) void materials.load(id); }, [id, materials.urls]);
  if (!id) return <span>仅支持已导入的本机图片</span>;
  return materials.urls[id] ? <img src={materials.urls[id]} alt={alt ?? "论文图片"} /> : <span>正在读取图片…</span>;
}
