/**
 * 可聚焦的选择器组件：用于 /resume 会话列表、/model 选项等。
 * 支持上下移动、Enter 选择（onSelect）、Esc 取消（onCancel）。
 */
import { style } from "../terminal/ansi.js";
import { parseKey } from "../terminal/input.js";
import type { Component, Focusable } from "./component.js";

export interface SelectOption {
  value: string;
  label: string;
  /** 附加描述（右对齐或第二行） */
  detail?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

export interface SelectorHandlers {
  onSelect?: (option: SelectOption) => void;
  onCancel?: () => void;
}

export class Selector implements Component, Focusable {
  options: SelectOption[] = [];
  selected = 0;
  focused = false;
  onSelect?: (option: SelectOption) => void;
  onCancel?: () => void;

  constructor(options: SelectOption[] = [], selected = 0, handlers: SelectorHandlers = {}) {
    this.options = options;
    this.selected = Math.min(selected, Math.max(0, options.length - 1));
    this.onSelect = handlers.onSelect;
    this.onCancel = handlers.onCancel;
  }

  invalidate(): void {}

  get placeholder(): string {
    return "";
  }

  handleInput(data: string): boolean {
    // 单个 ESC（parseKey 会视为等待更多字节）直接按取消处理
    if (data === "\x1b") {
      this.onCancel?.();
      return true;
    }
    const parsed = parseKey(data);
    if (!parsed) return false;
    const key = parsed.key;
    switch (key.kind) {
      case "arrow":
        if (key.direction === "up") return this.move(-1);
        if (key.direction === "down") return this.move(1);
        return false;
      case "enter": {
        const opt = this.options[this.selected];
        if (opt && !opt.disabled) this.onSelect?.(opt);
        return true;
      }
      default:
        return false;
    }
  }

  colorFor(label: string): string {
    return label;
  }

  private move(delta: number): boolean {
    const len = this.options.length;
    if (len === 0) return true;
    const next = (this.selected + delta + len) % len;
    const opt = this.options[next];
    if (!opt) return true;
    if (opt.disabled) return true;
    this.selected = next;
    return true;
  }

  render(width: number): string[] {
    const rows: string[] = [];
    // v1 简化：只渲染可见范围内的选项（不处理滚动窗口）
    const start = Math.max(0, this.selected - 6);
    const end = Math.min(this.options.length, start + 12);
    for (let i = start; i < end; i++) {
      const opt = this.options[i];
      if (!opt) continue;
      const isSel = i === this.selected;
      const marker = isSel ? "❯ " : "  ";
      if (opt.disabled) {
        rows.push(style(marker + opt.label, { fg: "#484f58", dim: true }));
      } else {
        const body = isSel ? style(marker + opt.label, { fg: "#22c55e", bold: true }) : style(marker + opt.label, { fg: "#c9d1d9" });
        rows.push(body);
      }
      if (opt.detail) rows.push(style(`   ${opt.detail}`, { fg: "#6e7681", dim: true }));
    }
    return rows;
  }
}
