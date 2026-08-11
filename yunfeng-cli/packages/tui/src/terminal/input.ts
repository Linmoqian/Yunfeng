/**
 * 终端原始输入解析：把 stdout 的字节流解析成结构化按键事件。
 *
 * 终端在 raw mode 下逐字符（或转义序列）发送输入。这里负责：
 * - 常规可打印字符 -> { kind: 'char', value }
 * - 转义序列 -> 功能键（方向键、Enter、Backspace 等）
 *
 * v1 覆盖常用子集（方向键、退格、回车、Tab、Esc、功能键）。
 * 复杂协议（Kitty keyboard、IME 组合）留待后续版本，见 docs 待补条目。
 * 解析器为无状态纯函数，便于单测。
 */

export type Key =
  | { kind: "char"; value: string }
  | { kind: "enter" }
  | { kind: "backspace" }
  | { kind: "tab" }
  | { kind: "escape" }
  | { kind: "arrow"; direction: "up" | "down" | "left" | "right" }
  | { kind: "home" }
  | { kind: "end" }
  | { kind: "delete" }
  | { kind: "ctrl"; value: string }
  | { kind: "unknown"; raw: string };

export interface ParseResult {
  key: Key;
  /** 该按键消耗的原始字节数（byte 级别步进用） */
  consumed: number;
}

/** 普通可见字符的 ASCII 区间 */
function isPrintable(ch: number): boolean {
  return ch >= 0x20 && ch <= 0x7e;
}

/** 解析单个字节为最简按键 */
function parseByte(b: number): Key | null {
  if (isPrintable(b)) {
    return { kind: "char", value: String.fromCharCode(b) };
  }
  if (b === 0x0a || b === 0x0d) {
    return { kind: "enter" };
  }
  if (b === 0x08 || b === 0x7f) {
    return { kind: "backspace" };
  }
  if (b === 0x09) {
    return { kind: "tab" };
  }
  if (b === 0x1b) {
    return { kind: "escape" };
  }
  // 控制字符（如 Ctrl+C = 0x03, Ctrl+D = 0x04）映射到 ctrl
  if (b >= 0x01 && b <= 0x1a) {
    return { kind: "ctrl", value: String.fromCharCode(b + 0x60) };
  }
  return null;
}

/** CSI 序列解析返回的跳转映射 */
const CSI_TABLE: Record<string, (pfx: string) => Key> = {
  A: (pfx) => ({ kind: "arrow", direction: "up" }),
  B: (pfx) => ({ kind: "arrow", direction: "down" }),
  C: (pfx) => ({ kind: "arrow", direction: "right" }),
  D: (pfx) => ({ kind: "arrow", direction: "left" }),
  H: (pfx) => ({ kind: "home" }),
  F: (pfx) => ({ kind: "end" }),
};

/** CSI ~ 序列（如 [3~ Delete、[1~ Home、[4~ End） */
const CSI_TILDE_TABLE: Record<string, Key> = {
  "1": { kind: "home" },
  "3": { kind: "delete" },
  "4": { kind: "end" },
};

/**
 * 尝试解析一个完整事件（可能跨多字节）。
 * 该方法要求 buffer 已包含足够字节；若返回 null 表示需要等待更多字节。
 *
 * @param data 累积的输入缓冲（string，按 charCode 逐个消费）
 * @param pos  解析起点
 */
export function parseKey(data: string, pos = 0): ParseResult | null {
  const ch0 = data.charCodeAt(pos);
  if (Number.isNaN(ch0)) return null;

  // ESC 前缀：可能是独立 ESC 或转义序列
  if (ch0 === 0x1b) {
    const ch1 = data.charCodeAt(pos + 1);
    // 独立 ESC
    if (data.length < pos + 2) return null;
    if (ch1 === 0x1b) {
      // 连续两次 ESC 视为一次 ESC（简化）
      return { key: { kind: "escape" }, consumed: 2 };
    }
    if (ch1 === 0x5b) {
      // CSI: ESC [
      const ch2 = data.charCodeAt(pos + 2);
      if (data.length < pos + 3) return null;
      // 读取参数直至找到 CSI 终止字符
      let j = pos + 2;
      let param = "";
      while (j < data.length) {
        const c = data.charCodeAt(j);
        const isParam = c === 0x3b || (c >= 0x30 && c <= 0x3f);
        if (isParam) {
          param += data[j];
          j++;
        } else {
          break;
        }
      }
      if (j >= data.length) return null;
      const finalChar = data[j];
      if (finalChar === "~") {
        const tildeKey = CSI_TILDE_TABLE[param];
        return {
          key: tildeKey ?? { kind: "unknown", raw: data.slice(pos, j + 1) },
          consumed: j + 1 - pos,
        };
      }
      const handler = finalChar != null ? CSI_TABLE[finalChar] : undefined;
      if (handler) {
        return { key: handler(param), consumed: j + 1 - pos };
      }
      return { key: { kind: "unknown", raw: data.slice(pos, j + 1) }, consumed: j + 1 - pos };
    }
    // 其他 ESC 前缀（如 \x1bO 应用模式），v1 暂不支持，按 unknown 处理
    return { key: { kind: "unknown", raw: data.slice(pos, pos + 2) }, consumed: 2 };
  }

  const key = parseByte(ch0);
  return key ? { key, consumed: 1 } : null;
}
