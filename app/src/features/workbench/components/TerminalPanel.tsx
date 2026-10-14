/* 工作台多终端标签与自定义菜单；会话清单来自 Rust。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button, Dropdown } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { Plus, Terminal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { terminalApi, terminalError } from "../services/terminal";
import { TerminalView } from "./TerminalView";
import styles from "./TerminalPanel.module.css";

export function TerminalPanel({ visible = true }: { visible?: boolean }) {
  const [ids, setIds] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const native = isTauri();
  function accept(next: string[]) {
    setIds((old) => old.join() === next.join() ? old : next);
    setActive((old) => next.includes(old) ? old : next[0] ?? "");
  }
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try { const next = await terminalApi.list(); if (!disposed) accept(next); }
      catch (reason) { if (!disposed) setError(terminalError(reason)); }
      if (!disposed) timer = setTimeout(() => { void refresh(); }, 1000);
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [native]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); accept(await terminalApi.list()); }
    catch (reason) { setError(terminalError(reason)); }
    finally { setBusy(false); }
  }
  async function create() {
    const started = await terminalApi.start({ cols: 80, rows: 24 });
    setActive(started.id);
  }
  async function close(selected: string[]) {
    for (const id of selected) await terminalApi.close(id);
  }
  return <div className={styles.panel}>
    <div className={styles.tabs} role="tablist" aria-label="本地终端标签">
      {ids.map((id, index) => <Dropdown key={id} trigger={["contextMenu"]} menu={{ items: [
        { key: "new", label: "新建终端", disabled: ids.length >= 4 },
        { key: "close", label: "关闭当前终端" },
        { key: "others", label: "关闭其他终端", disabled: ids.length < 2 },
        { key: "all", label: "关闭全部终端" },
      ], onClick: ({ key }) => { void run(() => key === "new" ? create() : close(key === "all" ? ids : key === "others" ? ids.filter((value) => value !== id) : [id])); } }}>
        <div className={styles.tab} data-active={id === active}>
          <button type="button" role="tab" aria-selected={id === active} onClick={() => setActive(id)}><Terminal size={13} />终端 {index + 1}</button>
          <button type="button" aria-label={`关闭终端 ${index + 1}`} disabled={busy} onClick={() => { void run(() => close([id])); }}><X size={12} /></button>
        </div>
      </Dropdown>)}
      <Button type="text" size="small" disabled={!native || busy || ids.length >= 4} aria-label="新建终端" title="新建终端" icon={<Plus size={15} />} onClick={() => { void run(create); }} />
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!native ? <p className={styles.empty}>终端需要 Tauri 原生应用</p> : !ids.length && <div className={styles.empty}><Terminal size={24} /><p>本机交互终端</p><Button disabled={busy} onClick={() => { void run(create); }}>启动终端</Button><small>使用默认 Shell，命令在本机执行</small></div>}
    {ids.map((id) => <TerminalView key={id} id={id} visible={visible && active === id}
      stop={() => { void run(() => terminalApi.stop(id)); }}
      restart={() => { void run(async () => { await terminalApi.close(id); await create(); }); }} />)}
  </div>;
}
