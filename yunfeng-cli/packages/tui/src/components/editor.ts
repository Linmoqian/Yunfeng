/**
 * 输入编辑器组件：支持文本光标、左右移动、退格、回车、多行文本。
 * 光标移动与删除按字素边界进行（不切断代理对/组合字符），
 * 通过 CURSOR_MARKER 将硬件光标定位到当前字符，支持 IME。
 */
import { style } from "../terminal/ansi.js";
import { parseKey } from "../terminal/input.js";
import { CURSOR_MARKER, type Component, type Focusable } from "./component.js";

let graphemeSegmenter: Intl.Segmenter | null = null;
function segmenter(): Intl.Segmenter {
  if (!graphemeSegmenter) {
    graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  }
  return graphemeSegmenter;
}

/** pos 之前一个完整字素的起始偏移 */
function previousGraphemeStart(text: string, pos: number): number {
  if (pos <= 0) return 0;
  let start = 0;
  for (const { index } of segmenter().segment(text)) {
    if (index >= pos) break;
    start = index;
  }
  return start;
}

/** pos 之后一个完整字素的结束偏移 */
function nextGraphemeEnd(text: string, pos: number): number {
  if (pos >= text.length) return pos;
  for (const { segment } of segmenter().segment(text.slice(pos))) {
    return pos + segment.length;
  }
  return pos + 1;
}

export class Editor implements Component, Focusable {
  /** 当前输入的原始文本（多行用 \n 分隔） */
  value = "";
  /** 光标位置：total offset（跨行累计，始终落在字素边界） */
  cursor = 0;
  focused = false;

  private invalidated = true;

  constructor(initial = "") {
    this.value = initial;
    this.cursor = initial.length;
  }

  invalidate(): void {
    this.invalidated = true;
  }

  private clampedCursor(): number {
    if (this.cursor < 0) return 0;
    if (this.cursor > this.value.length) return this.value.length;
    return this.cursor;
  }

  get currentLine(): number {
    let line = 0;
    for (let i = 0; i < this.value.length && i < this.clampedCursor(); i++) {
      if (this.value[i] === "\n") line++;
    }
    return line;
  }

  get currentLineCol(): number {
    const c = this.clampedCursor();
    const nl = this.value.lastIndexOf("\n", c - 1);
    return c - (nl === -1 ? 0 : nl + 1);
  }

  private insertChar(ch: string): void {
    const c = this.clampedCursor();
    this.value = this.value.slice(0, c) + ch + this.value.slice(c);
    this.cursor = c + ch.length;
    this.invalidate();
  }

  private deleteLeft(): void {
    const c = this.clampedCursor();
    if (c <= 0) return;
    // 若左侧是换行，删除换行合并当前行到上一行
    if (this.value[c - 1] === "\n") {
      this.value = this.value.slice(0, c - 1) + this.value.slice(c);
      this.cursor = c - 1;
    } else {
      const start = previousGraphemeStart(this.value, c);
      this.value = this.value.slice(0, start) + this.value.slice(c);
      this.cursor = start;
    }
    this.invalidate();
  }

  private deleteForward(): void {
    const c = this.clampedCursor();
    if (c >= this.value.length) return;
    const end = nextGraphemeEnd(this.value, c);
    this.value = this.value.slice(0, c) + this.value.slice(end);
    this.invalidate();
  }

  private moveLeft(): void {
    this.cursor = previousGraphemeStart(this.value, this.clampedCursor());
  }

  private moveRight(): void {
    this.cursor = nextGraphemeEnd(this.value, this.clampedCursor());
  }

  private moveHome(): void {
    const c = this.clampedCursor();
    const nl = this.value.lastIndexOf("\n", c - 1);
    this.cursor = nl === -1 ? 0 : nl + 1;
  }

  private moveEnd(): void {
    const c = this.clampedCursor();
    const nl = this.value.indexOf("\n", c);
    this.cursor = nl === -1 ? this.value.length : nl;
  }

  handleInput(data: string): boolean {
    const parsed = parseKey(data);
    if (!parsed) return false;
    const key = parsed.key;
    switch (key.kind) {
      case "char":
        this.insertChar(key.value);
        return true;
      case "enter":
        this.insertChar("\n");
        return true;
      case "backspace":
        this.deleteLeft();
        return true;
      case "delete":
        this.deleteForward();
        return true;
      case "home":
        this.moveHome();
        return true;
      case "end":
        this.moveEnd();
        return true;
      case "arrow":
        if (key.direction === "left") this.moveLeft();
        if (key.direction === "right") this.moveRight();
        if (key.direction === "up") this.moveUp();
        if (key.direction === "down") this.moveDown();
        return true;
      default:
        // 未消费：允许外层（如全局快捷键）处理
        return false;
    }
  }

  private moveUp(): void {
    const col = this.currentLineCol;
    const line = this.currentLine;
    if (line === 0) return;
    let target = 0;
    let seen = 0;
    for (let i = 0; i < this.value.length; i++) {
      if (this.value[i] === "\n") {
        seen++;
        if (seen === line) break;
        target = i + 1;
      }
    }
    // target 是上一行开头，取 min(col, 上一行长度) 位置
    const lineStart = target;
    const lineEnd = this.value.indexOf("\n", lineStart) === -1 ? this.value.length : this.value.indexOf("\n", lineStart);
    const upCol = Math.min(col, lineEnd - lineStart);
    this.cursor = lineStart + upCol;
  }

  private moveDown(): void {
    const col = this.currentLineCol;
    const line = this.currentLine;
    // 找到当前行结尾
    let lineEnd = this.value.indexOf("\n", this.clampedCursor());
    if (lineEnd === -1) lineEnd = this.value.length;
    if (lineEnd >= this.value.length) return; // 已是最后一行
    // 下一行从 lineEnd+1 开始
    const nextStart = lineEnd + 1;
    const nextEnd = this.value.indexOf("\n", nextStart) === -1 ? this.value.length : this.value.indexOf("\n", nextStart);
    const downCol = Math.min(col, nextEnd - nextStart);
    this.cursor = nextStart + downCol;
  }

  render(width: number): string[] {
    this.invalidated = false;
    const lines = this.value.split("\n");
    const rows: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (this.focused && i === this.currentLine) {
        const col = this.currentLineCol;
        const before = line.slice(0, col);
        const graphemeEnd = nextGraphemeEnd(line, col);
        const at = line.slice(col, graphemeEnd) ?? "";
        const after = line.slice(graphemeEnd);
        const prompt = i === lines.length - 1 ? "❯ " : "  ";
        // 在光标字符前插入 CURSOR_MARKER，并用 reverse 高亮光标字符
        const cursorChar = at.length > 0 ? `${CURSOR_MARKER}\x1b[7m${at}\x1b[27m` : CURSOR_MARKER + "▌";
        rows.push(style(prompt + before + cursorChar + after, { fg: "#c9d1d9" }));
      } else {
        const prompt = i === lines.length - 1 ? "❯ " : "· ";
        rows.push(style(prompt + line, { fg: "#8b949e" }));
      }
    }
    return rows;
  }
}
