/**
 * Markdown：轻量 markdown 渲染组件（不依赖第三方解析器）。
 * 支持：标题、粗体/斜体/行内代码/链接、代码块、列表、引用、分割线、普通段落。
 * 输出带 ANSI 样式的行，供 Messages 等展示 agent 回复。
 *
 * 参考 pi 的 markdown 方案，按 yunfeng-cli 需求精简（不含表格/HTML/图片）。
 */
import { style } from '../terminal/ansi.js';
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '../utils.js';
import type { Component } from './component.js';

const CODE_BG = '#161b22';
const CODE_FG = '#e6edf3';
const LINK_FG = '#58a6ff';
const HEADING_FG = '#f0f6fc';
const QUOTE_FG = '#8b949e';
const LIST_MARK = '#58a6ff';
const RULE_FG = '#30363d';

export class Markdown implements Component {
	private text: string;

	constructor(text = '') {
		this.text = text;
	}

	invalidate(): void {}

	setText(text: string): void {
		this.text = text;
	}

	render(width: number): string[] {
		return renderMarkdown(this.text, width);
	}
}

/** 渲染 markdown 文本为带 ANSI 样式的行数组 */
export function renderMarkdown(text: string, width: number): string[] {
	const lines = text.split(/\r\n|\r|\n/);
	const blocks: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? '';
		// 代码块：```lang ... ```
		const fence = /^```(\w*)/.exec(line);
		if (fence) {
			i++;
			const code: string[] = [];
			while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```')) {
				code.push(lines[i] ?? '');
				i++;
			}
			i++; // 跳过结束 fence
			blocks.push(...renderCodeBlock(code, width));
			continue;
		}
		// 标题：# ~ ######
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			blocks.push(style(heading[2]!, { fg: HEADING_FG, bold: true }));
			i++;
			continue;
		}
		// 分割线：--- / *** / ___
		if (/^\s*[-*_]{3,}\s*$/.test(line)) {
			blocks.push(style('─'.repeat(Math.max(1, width - 2)), { fg: RULE_FG }));
			i++;
			continue;
		}
		// 引用：> text
		if (line.trimStart().startsWith('>')) {
			blocks.push(style('▌ ' + renderInline(line.trimStart().slice(1).trim()), { fg: QUOTE_FG }));
			i++;
			continue;
		}
		// 列表：- / * / + / 1.
		const list = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
		if (list) {
			const marker = /^\d/.test(list[1]!) ? `${list[1]} ` : '• ';
			blocks.push(style(marker, { fg: LIST_MARK }) + renderInline(list[2]!));
			i++;
			continue;
		}
		// 普通行
		blocks.push(renderInline(line));
		i++;
	}
	// 逐行折行（wrapTextWithAnsi 保留 ANSI 样式）
	const rows: string[] = [];
	for (const block of blocks) {
		rows.push(...wrapTextWithAnsi(block, Math.max(1, width)));
	}
	return rows.length > 0 ? rows : [''];
}

/** 行内样式：`code`、**bold**、*italic*、[text](url) */
function renderInline(text: string): string {
	let out = '';
	let rest = text;
	const tokenRe = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/;
	while (rest.length > 0) {
		const m = tokenRe.exec(rest);
		if (!m) {
			out += rest;
			break;
		}
		out += rest.slice(0, m.index);
		const tok = m[0]!;
		if (tok.startsWith('`')) {
			out += style(tok.slice(1, -1), { fg: CODE_FG, bg: CODE_BG });
		} else if (tok.startsWith('**')) {
			out += style(tok.slice(2, -2), { bold: true });
		} else if (tok.startsWith('*')) {
			out += style(tok.slice(1, -1), { italic: true });
		} else if (tok.startsWith('[')) {
			const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
			if (mm) {
				out += style(mm[1]!, { fg: LINK_FG, underline: true });
			} else {
				out += tok;
			}
		}
		rest = rest.slice(m.index + tok.length);
	}
	return out;
}

/** 代码块：整行涂背景色 */
function renderCodeBlock(code: string[], width: number): string[] {
	const inner = Math.max(1, width - 2);
	return code.map((l) => {
		const body = truncateToWidth(l, inner);
		const pad = inner - visibleWidth(body);
		return style(' ' + body + ' '.repeat(Math.max(0, pad)), { bg: CODE_BG, fg: CODE_FG });
	});
}
