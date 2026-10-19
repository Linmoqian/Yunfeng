/* 本机终端 SDK；Rust 保存 PTY 与回放，浏览器预览没有执行能力。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface TerminalSize { cols: number; rows: number }
export interface TerminalChunk { data: number[]; cursor: number; truncated: boolean; closed: boolean; failed: boolean; exitCode?: number | null; agent?: boolean }
type Request = { action: "list" } | { action: "start"; size: TerminalSize }
  | { action: "read"; id: string; cursor: number } | { action: "write"; id: string; data: string }
  | { action: "resize"; id: string; size: TerminalSize } | { action: "stop" | "close"; id: string };
async function call<T>(request: Request): Promise<T> {
  if (!isTauri()) throw new Error("终端需要 Tauri 原生应用");
  return invoke<T>("terminal_action", { request });
}
/** 创建本机默认 Shell；最多四个会话，应用重启后失效。 */
export const terminalApi = {
  list: () => call<string[]>({ action: "list" }),
  start: (size: TerminalSize) => call<{ id: string }>({ action: "start", size }),
  read: (id: string, cursor: number) => call<TerminalChunk>({ action: "read", id, cursor }),
  write: (id: string, data: string) => call<void>({ action: "write", id, data }),
  resize: (id: string, size: TerminalSize) => call<void>({ action: "resize", id, size }),
  stop: (id: string) => call<void>({ action: "stop", id }),
  close: (id: string) => call<void>({ action: "close", id }),
};
export function terminalError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "code" in reason && "message" in reason
    && ["FORBIDDEN", "INVALID_SIZE", "INVALID_CURSOR", "INVALID_INPUT", "BUSY", "LIMIT", "NOT_FOUND",
      "STATE_ERROR", "START_FAILED", "WRITE_FAILED", "RESIZE_FAILED", "STOP_FAILED"].includes(String(reason.code))) return String(reason.message);
  return "终端操作失败，请重试";
}
