/* 双窗口共享视图：单个在途写入，其余编辑合并，确认前保留本地输入。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { useComponentPresentation } from "./useComponentPresentation";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { componentDefaults, patchComponent, readComponent, sharingError, subscribeComponent, type ComponentSnapshot, type ComponentStates, type SharedComponentId } from "../services/componentSharing";

export function useSharedComponent<K extends SharedComponentId>(component: K) {
  const [value, setValue] = useState<ComponentStates[K]>(componentDefaults[component]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(!isTauri());
  const [syncing, setSyncing] = useState(false);
  const revision = useRef(-1);
  const pending = useRef<Partial<ComponentStates[K]>>({});
  const queued = useRef<Partial<ComponentStates[K]>>({});
  const busy = useRef(false);

  function accept(snapshot: ComponentSnapshot<K>) {
    if (snapshot.revision < revision.current) return;
    revision.current = snapshot.revision;
    setValue({ ...snapshot.state, ...pending.current });
    setReady(true);
  }
  async function flush() {
    if (busy.current || !Object.keys(queued.current).length) return;
    busy.current = true;
    setSyncing(true);
    const patch = queued.current;
    queued.current = {};
    try {
      const snapshot = await patchComponent(component, patch);
      for (const key of Object.keys(patch) as (keyof ComponentStates[K])[]) {
        if (pending.current[key] === patch[key]) delete pending.current[key];
      }
      accept(snapshot);
      setError("");
    } catch (reason) {
      queued.current = { ...patch, ...queued.current };
      setError(sharingError(reason));
      busy.current = false;
      setSyncing(false);
      return;
    }
    busy.current = false;
    if (Object.keys(queued.current).length) void flush();
    else setSyncing(false);
  }
  function update(patch: Partial<ComponentStates[K]>) {
    setValue((current) => ({ ...current, ...patch }));
    if (!isTauri()) return;
    pending.current = { ...pending.current, ...patch };
    queued.current = { ...queued.current, ...patch };
    void flush();
  }
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try { const snapshot = await readComponent(component); if (alive) { accept(snapshot); if (!Object.keys(pending.current).length) setError(""); } }
      catch (reason) { if (alive) setError(sharingError(reason)); }
    };
    const poll = async () => {
      await refresh();
      if (alive) timer = setTimeout(poll, 5000);
    };
    // 注册失败在后台恢复；轮询与聚焦补偿首次读取和订阅之间遗漏的通知。
    void subscribeComponent(component, (snapshot) => { if (alive) { accept(snapshot); if (!Object.keys(pending.current).length) setError(""); } }).then((stop) => {
      if (!alive) { stop(); return; }
      unsubscribe = stop;
      void poll();
    }).catch((reason) => { if (alive) { setError(sharingError(reason)); void poll(); } });
    window.addEventListener("focus", refresh);
    return () => { alive = false; unsubscribe?.(); clearTimeout(timer); window.removeEventListener("focus", refresh); };
    // 每个组件实例的 ID 固定，accept 只使用 ref 和状态 setter。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component]);
  async function retry() {
    try { accept(await readComponent(component)); setError(""); void flush(); }
    catch (reason) { setError(sharingError(reason)); }
  }
  useComponentPresentation(component, revision.current, ready, Object.keys(pending.current).length > 0);
  return { value, update, error, ready, syncing, retry };
}
