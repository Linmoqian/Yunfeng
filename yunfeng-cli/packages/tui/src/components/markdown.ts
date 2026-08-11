/**
 * Markdown：轻量 markdown 渲染组件（不依赖第三方解析器）。
 * 支持：标题、粗体/斜体/行内代码/链接、代码块、列表、引用、分割线、普通段落。
 * 颜色通过 MarkdownTheme 配置（默认值与项目现有配色一致），可整体替换。
 *
 * 参考 pi 的 markdown 方案（含 theme），按 yunfeng-cli 需求精简。
 */
import { style } from '../terminal/ansi.js';
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '../utils.js';
import type { Component } from './component.js';

/** 主题：每种元素一个着色函数（模仿 pi 的 MarkdownTheme） */
export interface MarkdownTheme {
	heading?: (text: string) => string;
	bold?: (text: string) => string;
	italic?: (text: string) => string;
	code?: (text: string) => string;
	codeBlock?: (text: string) => string;
	link?: (text: string) => string;
	quote?: (text: string) => string;
	listBullet?: (text: string) => string;
	hr?: (text: string) => string;
}

export const DEFAULT_MARKDOWN_THEME: MarkdownTheme = {
	heading: (t) => style(t, { fg: '#f0f6fc', bold: true }),
	bold: (t) => style(t, { bold: true }),
	italic: (t) => style(t, { italic: true }),
	code: (t) => style(t, { fg: '#e6edf3', bg: '#161b22' }),
	codeBlock: (t) => style(t, { fg: '#e6edf3', bg: '#161b22' }),
	link: (t) => style(t, { fg: '#58a6ff', underline: true }),
	quote: (t) => style(t, { fg: '#8b949e' }),
	listBullet: (t) => style(t, { fg: '#58a6ff' }),
	hr: (t) => style(t, { fg: '#30363d' }),
};

export interface MarkdownOptions {
	theme?: MarkdownTheme;
}

export class Markdown implements Component {
	private text: string;
	private theme: MarkdownTheme;

	constructor(text = '', options: MarkdownOptions = {}) {
		this.text = text;
		this.theme = options.theme ?? DEFAULT_MARKDOWN_THEME;
	}

	invalidate(): void {}

	setText(text: string): void {
		this.text = text;
	}

	render(width: number): string[] {
		return renderMarkdown(this.text, width, this.theme);
	}
}

/** 渲染 markdown 文本为带 ANSI 样式的行数组 */
export function renderMarkdown(text: string, width: number, theme: MarkdownTheme = DEFAULT_MARKDOWN_THEME): string[] {
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
			blocks.push(...renderCodeBlock(code, width, theme));
			continue;
		}
		// 标题：# ~ ######
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			blocks.push(theme.heading?.(heading[2]!) ?? heading[2]!);
			i++;
			continue;
		}
		// 分割线：--- / *** / ___
		if (/^\s*[-*_]{3,}\s*$/.test(line)) {
			const rule = '─'.repeat(Math.max(1, width - 2));
			blocks.push(theme.hr?.(rule) ?? rule);
			i++;
			continue;
		}
		// 引用：> text
		if (line.trimStart().startsWith('>')) {
			const body = '▌ ' + renderInline(line.trimStart().slice(1).trim(), theme);
			blocks.push(theme.quote?.(body) ?? body);
			i++;
			continue;
		}
		// 列表：- / * / + / 1.
		const list = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
		if (list) {
			const marker = /^\d/.test(list[1]!) ? `${list[1]} ` : '• ';
			const mark = theme.listBullet?.(marker) ?? marker;
			blocks.push(mark + renderInline(list[2]!, theme));
			i++;
			continue;
		}
		// 普通行
		blocks.push(renderInline(line, theme));
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
function renderInline(text: string, theme: MarkdownTheme): string {
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
			out += theme.code?.(tok.slice(1, -1)) ?? tok;
		} else if (tok.startsWith('**')) {
			out += theme.bold?.(tok.slice(2, -2)) ?? tok;
		} else if (tok.startsWith('*')) {
			out += theme.italic?.(tok.slice(1, -1)) ?? tok;
		} else if (tok.startsWith('[')) {
			const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
			if (mm) {
				out += theme.link?.(mm[1]!) ?? mm[1]!;
			} else {
				out += tok;
			}
		}
		rest = rest.slice(m.index + tok.length);
	}
	return out;
}

/** 代码块：整行涂背景色 */
function renderCodeBlock(code: string[], width: number, theme: MarkdownTheme): string[] {
	const inner = Math.max(1, width - 2);
	return code.map((l) => {
		const body = truncateToWidth(l, inner);
		const pad = inner - visibleWidth(body);
		const line = ' ' + body + ' '.repeat(Math.max(0, pad));
		return theme.codeBlock?.(line) ?? line;
	});
}
