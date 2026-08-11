/**
 * ANSI escape sequence primitives.
 *
 * 只提供最基础的渲染原语：SGR 样式、清屏、光标移动。
 * 不做任何业务逻辑，保持纯函数、可测试、无 I/O。
 *
 * 设计取舍与约束见 docs/development/hot-reload.md 之外，
 * 这里遵循：SGR 样式不跨行传递，每一行单独包裹（终端行为）。
 */

/** 样式风格选项 */
export interface Style {
  /** 前景色（256 色或 truecolor） */
  fg?: string;
  /** 背景色 */
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  reverse?: boolean;
  strikethrough?: boolean;
}

/** ANSI SGR 重置 */
export const RESET = "\x1b[0m";

/** 命名色 -> SGR 码 */
const NAMED_FG: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
};
const NAMED_BG: Record<string, number> = {
  black: 40,
  red: 41,
  green: 42,
  yellow: 43,
  blue: 44,
  magenta: 45,
  cyan: 46,
  white: 47,
};

/**
 * 解析颜色 token 为 SGR 数值段（不含前缀序号）。
 * 支持命名色（red/blue...）、`#rrggbb`（truecolor）、`256:<n>` 或数字。
 */
/** 颜色渲染模式 */
export type ColorMode = "truecolor" | "256" | "16" | "none";

let colorMode: ColorMode = "truecolor";

/** 设置颜色渲染模式（终端能力探测后调用；"none" 表示禁用颜色） */
export function setColorMode(mode: ColorMode): void {
  colorMode = mode;
}

export function getColorMode(): ColorMode {
  return colorMode;
}

/** 解析 #rrggbb 为 {r,g,b} */
function parseHex(color: string): { r: number; g: number; b: number } | null {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!m) return null;
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) };
}

/** truecolor 量化到 256 色近似值（16 + 36r + 6g + b） */
function quantize256(r: number, g: number, b: number): number {
  const q = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

/** 颜色近似到 16 色（灰阶或 6 基本色），返回命名色名 */
function nearest16Name(r: number, g: number, b: number): string {
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  if (Math.abs(r - gray) < 40 && Math.abs(g - gray) < 40 && Math.abs(b - gray) < 40) {
    return gray < 128 ? "black" : "white";
  }
  if (r > 128 && g < 100 && b < 100) return "red";
  if (r < 100 && g > 128 && b < 100) return "green";
  if (r > 128 && g > 128 && b < 100) return "yellow";
  if (r < 100 && g < 100 && b > 128) return "blue";
  if (r > 128 && g < 100 && b > 128) return "magenta";
  if (r < 100 && g > 128 && b > 128) return "cyan";
  return gray < 128 ? "black" : "white";
}

/** 256 色索引 -> rgb 近似值 */
function indexToRgb(n: number): { r: number; g: number; b: number } | null {
  if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  if (n < 16) {
    const v = n === 0 ? 0 : 128 + (n - 8) * 16;
    return { r: v, g: v, b: v };
  }
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return { r: v, g: v, b: v };
  }
  const m = n - 16;
  const b = m % 6;
  const g = Math.floor(m / 6) % 6;
  const r = Math.floor(m / 36);
  const to = (v: number) => (v === 0 ? 0 : 55 + v * 40);
  return { r: to(r), g: to(g), b: to(b) };
}

/** 解析颜色 token 为 SGR 数值段（不含前缀序号）。
 * 支持命名色（red/blue...）、`#rrggbb`（truecolor）、`256:<n>` 或数字。
 * 按当前 colorMode 降级：none 无色、16 近似基本色、256 量化、truecolor 原样。
 */
function colorCode(color: string, isBg: boolean): string | null {
  if (colorMode === "none") return null;
  const named = (isBg ? NAMED_BG : NAMED_FG)[color];
  if (named !== undefined) return String(named);

  const hex = parseHex(color);
  const n = color.startsWith("256:") ? Number(color.slice(4)) : Number(color);
  const rgb =
    hex ??
    (Number.isInteger(n) && n >= 0 && n <= 255 ? indexToRgb(n) : null);

  if (colorMode === "16") {
    if (!rgb) return null;
    const name = nearest16Name(rgb.r, rgb.g, rgb.b);
    const code = (isBg ? NAMED_BG : NAMED_FG)[name];
    return code != null ? String(code) : null;
  }
  if (colorMode === "256") {
    if (rgb) {
      const q = quantize256(rgb.r, rgb.g, rgb.b);
      return isBg ? `48;5;${q}` : `38;5;${q}`;
    }
    if (color.startsWith("256:") && Number.isInteger(n) && n >= 0 && n <= 255) {
      return isBg ? `48;5;${n}` : `38;5;${n}`;
    }
    return null;
  }
  // truecolor
  if (hex) {
    return isBg ? `48;2;${hex.r};${hex.g};${hex.b}` : `38;2;${hex.r};${hex.g};${hex.b}`;
  }
  if (color.startsWith("256:") && Number.isInteger(n) && n >= 0 && n <= 255) {
    return isBg ? `48;5;${n}` : `38;5;${n}`;
  }
  if (Number.isInteger(n) && n >= 0 && n <= 255) {
    return isBg ? `48;5;${n}` : `38;5;${n}`;
  }
  return null;
}


function sgrParams(style: Style): string {
  const params: number[] = [];
  const fg = style.fg ? colorCode(style.fg, false) : null;
  const bg = style.bg ? colorCode(style.bg, true) : null;
  if (style.bold) params.push(1);
  if (style.dim) params.push(2);
  if (style.italic) params.push(3);
  if (style.underline) params.push(4);
  if (style.reverse) params.push(7);
  if (style.strikethrough) params.push(9);
  // 颜色段已带分号，按数值在前的顺序拼接仍合法
  const head = params.join(";");
  const parts = [head, fg, bg].filter((p) => p !== null && p !== "");
  return parts.join(";");
}

/**
 * 用样式包裹文本，自动在不含样式时原样返回。
 */
export function style(text: string, s: Style): string {
  const body = sgrParams(s);
  if (!body) return text;
  return `\x1b[${body}m${text}${RESET}`;
}

/** 光标上移 n 行(n 为列宽相关的绝对移动，用于刷新) */
export function cursorUp(n = 1): string {
  return `\x1b[${n}A`;
}

/** 清楚当前行到末尾 */
export function clearLine(): string {
  return "\x1b[2K";
}

/** 清除整屏 */
export function clearScreen(): string {
  return "\x1b[2J";
}

/** 光标移动到原点 */
export function cursorHome(): string {
  return "\x1b[H";
}

/** 隐藏/显示光标 */
export const hideCursor = "\x1b[?25l";
export const showCursor = "\x1b[?25h";

/**
 * 可见宽度估算：去掉 ANSI 转义序列后统计字符数。
 * 注意：CJK 宽字符按 1 计（简化处理），适合行数统计与对齐。
 */
export function visibleWidth(text: string): number {
  // 去除所有 \x1b[...m 之外的控制序列（光标移动等）
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").length;
}
