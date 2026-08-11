/**
 * 吉祥物组件：一朵白云。
 * 纯渲染 + 可选浮动动画。动画由外部驱动（tick/setFrame）或内置定时器；
 * 内置定时器需要 onFrame 回调通知 TUI 重绘。
 */
import { style } from "../terminal/ansi.js";
import type { Component } from "./component.js";

/** 云朵图形宽度（列） */
const CLOUD_WIDTH = 19;

/** 云朵图形：19 列 × 7 行，居中 */
const CLOUD_LINES = [
  "      ▄▄▄▄▄▄▄      ",
  "   ▄███████████▄   ",
  "  ███████████████  ",
  " ██████●███●██████ ",
  "████████▁▁▁████████",
  " ▀███████████████▀ ",
  "   ▀▀▀▀▀▀▀▀▀▀▀▀▀   ",
];

/** 云朵配色：按字符类型上色 */
const CLOUD_COLORS: Record<string, string> = {
  "█": "#f0f6fc", // 主体：白
  "▄": "#f0f6fc", // 顶部：白
  "▀": "#9db4d0", // 下缘：浅蓝灰
  "●": "#1f2328", // 眼睛：深
  "▁": "#1f2328", // 嘴：深
};

export interface MascotOptions {
  /** 是否启用内置浮动动画（默认 false；需配合 onFrame 刷新 TUI） */
  animate?: boolean;
  /** 动画间隔 ms（默认 500） */
  intervalMs?: number;
  /** 帧变化回调：外部据此调用 tui.requestRender() */
  onFrame?: () => void;
}

export class Mascot implements Component {
  /** 当前动画帧：偶数=原位，奇数=上浮 1 行 */
  frame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private onFrame?: () => void;

  constructor(options: MascotOptions = {}) {
    this.intervalMs = options.intervalMs ?? 500;
    this.onFrame = options.onFrame;
    if (options.animate) this.start();
  }

  invalidate(): void {}

  /** 推进一帧（手动驱动动画） */
  tick(): void {
    this.frame += 1;
  }

  setFrame(n: number): void {
    this.frame = n;
  }

  /** 启动内置浮动动画 */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick();
      this.onFrame?.();
    }, this.intervalMs);
  }

  /** 停止内置动画（退出时调用） */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  render(width: number): string[] {
    // 浮动：奇数帧上浮 1 行（前导空行）
    const float = this.frame % 2 === 1 ? 1 : 0;
    const indent = Math.max(0, Math.floor((width - CLOUD_WIDTH) / 2));
    const rows: string[] = [];
    for (let i = 0; i < float; i++) rows.push("");
    for (const line of CLOUD_LINES) {
      rows.push(paintCloudLine(line, indent));
    }
    return rows;
  }
}

/** 按字符类型给云朵行上色，并在左侧留出缩进 */
function paintCloudLine(line: string, indent: number): string {
  let out = " ".repeat(indent);
  for (const ch of line) {
    const color = CLOUD_COLORS[ch];
    out += color ? style(ch, { fg: color }) : ch;
  }
  return out;
}
