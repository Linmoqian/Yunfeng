/**
 * Overlay：模态弹层组件。
 * 渲染时覆盖整个屏幕：上下留白（遮罩）+ 居中内容框（带边框与标题）。
 * 由 TuiBase.openOverlay 打开；打开后只渲染弹层，其余区域被覆盖。
 */
import { style } from "../terminal/ansi.js";
import { truncateToWidth, visibleWidth } from "../utils.js";
import type { Component } from "./component.js";

export interface OverlayOptions {
  /** 弹层内容（如 Selector） */
  content: Component;
  /** 标题（显示在边框顶行） */
  title?: string;
  /** 内容框宽度（默认 min(60, 屏宽-4)） */
  width?: number;
  /** 内容框高度（默认按内容行数，不超过屏高-4） */
  height?: number;
}

const BORDER_FG = "#58a6ff";

export class Overlay implements Component {
  content: Component;
  title: string;
  width?: number;
  height?: number;

  constructor(opts: OverlayOptions) {
    this.content = opts.content;
    this.title = opts.title ?? "";
    this.width = opts.width;
    this.height = opts.height;
  }

  invalidate(): void {
    this.content.invalidate();
  }

  render(screenWidth: number, screenHeight?: number): string[] {
    const viewport = Math.max(1, screenHeight ?? 8);
    const innerWidth = Math.max(10, Math.min(this.width ?? 60, screenWidth - 4));
    const contentRows = this.content.render(innerWidth - 2);
    const innerHeight = Math.max(1, Math.min(this.height ?? contentRows.length, viewport - 4));
    const boxHeight = innerHeight + 2; // 内容 + 上下边框
    const topPad = Math.max(1, Math.floor((viewport - boxHeight) / 2));

    const rows: string[] = [];
    for (let i = 0; i < topPad; i++) rows.push("");
    rows.push(this.renderBorder(innerWidth, "top"));
    for (let i = 0; i < innerHeight; i++) {
      const line = contentRows[i] ?? "";
      const body = truncateToWidth(line, innerWidth - 2);
      const pad = innerWidth - 2 - visibleWidth(body);
      rows.push(style("│", { fg: BORDER_FG }) + body + " ".repeat(Math.max(0, pad)) + style("│", { fg: BORDER_FG }));
    }
    rows.push(this.renderBorder(innerWidth, "bottom"));
    while (rows.length < viewport) rows.push("");
    return rows;
  }

  private renderBorder(width: number, kind: "top" | "bottom"): string {
    const inner = "─".repeat(Math.max(0, width - 2));
    if (kind === "top" && this.title) {
      const label = truncateToWidth(` ${this.title} `, width - 2);
      const pad = Math.max(0, width - 2 - visibleWidth(label));
      return (
        style("┌", { fg: BORDER_FG }) +
        label +
        "─".repeat(pad) +
        style("┐", { fg: BORDER_FG })
      );
    }
    return (
      style(kind === "top" ? "┌" : "└", { fg: BORDER_FG }) +
      "─".repeat(width - 2) +
      style(kind === "top" ? "┐" : "┘", { fg: BORDER_FG })
    );
  }
}
