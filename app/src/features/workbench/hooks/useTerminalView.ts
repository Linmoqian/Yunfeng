/* xterm 生命周期与有序 PTY 输入输出；主题变化不会重启 Shell。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { terminalApi, terminalError } from "../services/terminal";
import { useThemeMode } from "../../../theme/ThemeProvider";

function applyTheme(terminal: Terminal, viewport: HTMLElement) {
  const style = getComputedStyle(viewport);
  const token = (name: string) => style.getPropertyValue(name).trim();
  terminal.options.theme = {
    background: token("--yf-bg-canvas"), foreground: token("--yf-text-primary"),
    cursor: token("--yf-brand-primary"), cursorAccent: token("--yf-bg-canvas"),
    selectionBackground: `${token("--yf-brand-primary")}40`,
    black: "#3b3840", red: "#b34650", green: "#35734c", yellow: "#99742b",
    blue: "#526cb0", magenta: "#8665a6", cyan: "#367b86", white: "#d6d2df",
    brightBlack: "#817b8d", brightRed: "#d96f7b", brightGreen: "#6fb988",
    brightYellow: "#d7b66b", brightBlue: "#9aade8", brightMagenta: "#c3a6e0",
    brightCyan: "#8fced6", brightWhite: "#fafafc",
  };
}

export function useTerminalView(id: string, visible: boolean) {
  const viewport = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const focus = () => terminalRef.current?.focus();
  const clear = () => { terminalRef.current?.clear(); focus(); };
  const [status, setStatus] = useState("连接中");
  const [error, setError] = useState("");
  const { resolvedMode } = useThemeMode();
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    let disposed = false;
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastSize = "";
    let queue = Promise.resolve();
    let pending = 0;
    const terminal = new Terminal({ cursorBlink: true, fontSize: 12, scrollback: 3000,
      fontFamily: 'Menlo, Monaco, Consolas, "PingFang SC", monospace', allowProposedApi: true });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = "11";
    terminal.open(node);
    terminal.textarea?.setAttribute("aria-label", "终端输入");
    applyTheme(terminal, node);
    terminalRef.current = terminal;
    const fail = (reason: unknown) => { if (!disposed) setError(terminalError(reason)); };
    const resize = () => {
      if (disposed || !visibleRef.current || node.clientWidth < 40 || node.clientHeight < 40) return;
      fit.fit();
      const size = { cols: Math.max(20, Math.min(300, terminal.cols)), rows: Math.max(4, Math.min(200, terminal.rows)) };
      const key = `${size.cols}:${size.rows}`;
      if (key !== lastSize) { lastSize = key; void terminalApi.resize(id, size).catch(fail); }
    };
    const observer = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 80); });
    observer.observe(node);
    const input = terminal.onData((data) => {
      const bytes = new TextEncoder().encode(data).length;
      if (bytes > 16384 || pending + bytes > 65536) { setError("输入过多，请分批粘贴，单次最多 16 KiB"); return; }
      pending += bytes;
      queue = queue.then(async () => { if (!disposed) await terminalApi.write(id, data); })
        .catch(fail).finally(() => { pending -= bytes; });
    });
    const read = async () => {
      try {
        const chunk = await terminalApi.read(id, cursor);
        if (disposed) return;
        if (chunk.truncated) { terminal.reset(); terminal.writeln("[输出超过缓存上限，已跳至最近内容]"); }
        if (chunk.data.length) await new Promise<void>((resolve) => terminal.write(new Uint8Array(chunk.data), resolve));
        if (disposed) return;
        cursor = chunk.cursor;
        terminal.options.disableStdin = chunk.closed;
        if (chunk.failed) setError("终端输出读取失败，请重新启动");
        setStatus(chunk.agent
          ? chunk.closed ? `Agent · 已结束${chunk.exitCode != null ? `（${chunk.exitCode}）` : ""}` : "Agent · 运行中"
          : chunk.closed ? "已停止" : "已连接");
        if (!chunk.closed) timer = setTimeout(() => { void read(); }, chunk.data.length ? 10 : 100);
      } catch (reason) { if (!disposed) { fail(reason); setStatus("连接中断"); } }
    };
    void read();
    resize();
    return () => {
      disposed = true;
      clearTimeout(timer); clearTimeout(resizeTimer);
      observer.disconnect(); input.dispose(); terminal.dispose(); terminalRef.current = null;
    };
  }, [id]);
  useEffect(() => {
    if (terminalRef.current && viewport.current) applyTheme(terminalRef.current, viewport.current);
  }, [resolvedMode]);
  useEffect(() => { if (visible) focus(); }, [visible]);
  return { viewport, status, error, focus, clear };
}
