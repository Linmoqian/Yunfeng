/* 图片元数据与预览缓存；聚焦和定期读取补偿其他窗口的修改。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { paperAssetAction, paperError, type PaperAsset, type AssetAction } from "../services/paperAssets";
export function usePaperAssets() {
  const [assets, setAssets] = useState<PaperAsset[]>([]);
  const [urls, setUrls] = useState<Record<string,string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fetching = useRef(false);
  const reading = useRef(new Set<string>());
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    if (!isTauri() || fetching.current) return;
    fetching.current = true;
    try {
      const items = await paperAssetAction<PaperAsset[]>({ action: "list" });
      if (!alive.current) return;
      setAssets(items);
    } catch (reason) { if (alive.current) setError(paperError(reason)); }
    finally { fetching.current = false; }
  }, []);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (alive.current) timer = setTimeout(poll, 5000); };
    void poll(); window.addEventListener("focus", refresh);
    return () => { alive.current = false; clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  async function load(id: string) {
    if (urls[id] || reading.current.has(id)) return;
    reading.current.add(id);
    try { const result = await paperAssetAction<{url:string}>({ action:"read",id }); if (alive.current) setUrls((current) => ({ ...current, [id]:result.url })); }
    catch (reason) { if (alive.current) setError(paperError(reason)); }
    finally { reading.current.delete(id); }
  }
  async function act(request: AssetAction) {
    if (busy) return;
    setBusy(true); setError("");
    try { await paperAssetAction(request); await refresh(); }
    catch (reason) { setError(paperError(reason)); }
    finally { setBusy(false); }
  }
  async function importFile(file: File) {
    if (file.size > 20*1024*1024) { setError("每张图片最多 20 MiB"); return; }
    await act({ action:"import", name:file.name, bytes:Array.from(new Uint8Array(await file.arrayBuffer())) });
  }
  return { assets, urls, error, busy, refresh, load, act, importFile };
}
