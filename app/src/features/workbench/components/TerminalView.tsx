/* 本机交互终端画布与工具栏，使用 Yunfeng token。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { Button } from "antd";
import { Eraser, RotateCcw, Square } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { useTerminalView } from "../hooks/useTerminalView";
import styles from "./TerminalPanel.module.css";

export function TerminalView({ id, visible, stop, restart }: {
  id: string; visible: boolean; stop: () => void; restart: () => void;
}) {
  const terminal = useTerminalView(id, visible);
  return <section className={styles.view} hidden={!visible} aria-label="本地交互式终端">
    <header className={styles.toolbar}><span role="status">{terminal.status}</span>
      <Button type="text" size="small" aria-label="清空终端显示" title="清屏" icon={<Eraser size={14} />} onClick={terminal.clear} />
      <Button type="text" size="small" aria-label="重启终端" title="重启终端" icon={<RotateCcw size={14} />} onClick={restart} />
      <Button type="text" size="small" aria-label="停止终端" title="停止终端" disabled={terminal.status === "已停止"} icon={<Square size={13} />} onClick={stop} />
    </header>
    <div className={styles.viewport} ref={terminal.viewport} onClick={terminal.focus} />
    {terminal.error && <p className={styles.error} role="alert">{terminal.error}</p>}
  </section>;
}
