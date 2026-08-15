/**
 * 状态栏组件：固定在 TUI 底部的单行 footer。
 *
 * 展示顺序：左侧工作目录；右侧按优先级收纳会话、模型、思考强度、
 * 上下文占用与开销。窄终端时从右向左降级右侧信息，并截断长路径。
 *
 * 宽度按终端可见列计算（CJK=2、emoji=2、ANSI=0），避免状态栏换行或溢出；
 * 颜色跟随 Yunfeng 主题 token，上下文用量过高时使用 warning/error 语义色。
 */
import { style } from '../terminal/ansi.js';
import { getYunfengTheme, type YunfengTheme } from '../theme.js';
import { truncateToWidth, visibleWidth } from '../utils.js';
import type { Component } from './component.js';

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface StatusInfo {
	cwd: string;
	sessionName: string;
	/** 模型名（未接入时为空） */
	model?: string;
	/** 上下文已用 token */
	contextUsed?: number;
	/** 上下文窗口上限 token（提供时显示 used/limit） */
	contextLimit?: number;
	/** 思考强度 */
	reasoning?: ReasoningEffort;
	/** 当前总额计开销（美元） */
	cost?: number;
}

/** 格式化 token 数：>=1000 显示为 k（如 12480 -> 12.5k） */
export function formatTokens(n: number): string {
	if (n >= 1000) {
		const v = n / 1000;
		return `${v >= 100 ? Math.round(v) : v.toFixed(1)}k`;
	}
	return String(n);
}

/** 状态栏内部片段：先按纯文本排版，再应用主题色 */
interface StatusSegment {
	text: string;
	color: (theme: YunfengTheme) => string;
	bold?: boolean;
}

const ELLIPSIS = '…';
const GAP_WIDTH = 2;
const SEPARATOR = ' · ';

/** 单行状态文本不允许换行/制表符，避免破坏 footer 行 */
function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, ' ')
		.replace(/ +/g, ' ')
		.trim();
}

function contextRatio(info: StatusInfo): number | null {
	if (info.contextUsed === undefined || info.contextLimit === undefined || info.contextLimit <= 0) return null;
	return info.contextUsed / info.contextLimit;
}

function contextColor(info: StatusInfo, theme: YunfengTheme): string {
	const ratio = contextRatio(info);
	if (ratio !== null && ratio >= 0.9) return theme.error;
	if (ratio !== null && ratio >= 0.7) return theme.warning;
	return theme.textSecondary;
}

function reasoningColor(level: ReasoningEffort, theme: YunfengTheme): string {
	if (level === 'high') return theme.warning;
	if (level === 'medium') return theme.info;
	return theme.textTertiary;
}

/** 构建右侧片段；数组顺序即展示优先级（越靠后越先被窄屏丢弃） */
function buildSegments(info: StatusInfo): StatusSegment[] {
	const segments: StatusSegment[] = [];
	const sessionName = sanitizeStatusText(info.sessionName);
	if (sessionName) {
		segments.push({ text: `📁 ${sessionName}`, color: (t) => t.textSecondary });
	}
	const model = sanitizeStatusText(info.model ?? '');
	if (model) {
		segments.push({ text: `🤖 ${model}`, color: (t) => t.brand, bold: true });
	}
	const reasoning = info.reasoning;
	if (reasoning) {
		segments.push({ text: `🧠 ${reasoning}`, color: (t) => reasoningColor(reasoning, t) });
	}
	if (info.contextUsed !== undefined) {
		const context =
			info.contextLimit !== undefined
				? `⨁ ${formatTokens(info.contextUsed)}/${formatTokens(info.contextLimit)}`
				: `⨁ ${formatTokens(info.contextUsed)}`;
		segments.push({ text: context, color: (t) => contextColor(info, t) });
	}
	if (info.cost !== undefined) {
		segments.push({ text: `$${info.cost.toFixed(2)}`, color: (t) => t.textSecondary });
	}
	return segments;
}

/** 在 budget 列内尽量保留靠前片段；放不下的最后一段截断并加省略号 */
function fitSegments(segments: StatusSegment[], budget: number): StatusSegment[] {
	if (segments.length === 0 || budget <= 0) return [];
	const separatorWidth = visibleWidth(SEPARATOR);
	const chosen: StatusSegment[] = [];
	let used = 0;
	for (const segment of segments) {
		const width = visibleWidth(segment.text);
		const needed = chosen.length === 0 ? width : used + separatorWidth + width;
		if (needed <= budget) {
			chosen.push(segment);
			used = needed;
			continue;
		}
		const remaining = budget - used - (chosen.length === 0 ? 0 : separatorWidth);
		if (remaining >= visibleWidth(ELLIPSIS) + 1) {
			chosen.push({ ...segment, text: truncateToWidth(segment.text, remaining, ELLIPSIS) });
		}
		break;
	}
	return chosen;
}

function segmentsPlainWidth(segments: StatusSegment[]): number {
	if (segments.length === 0) return 0;
	return visibleWidth(segments.map((s) => s.text).join(SEPARATOR));
}

/** 给文本上色并铺满主题背景（每段独立包裹，避免嵌套 RESET 清掉背景） */
function paint(text: string, theme: YunfengTheme, fg?: string, bold = false): string {
	return style(text, { fg: fg ?? theme.textSecondary, bg: theme.surface, bold });
}

function assembleLine(
	theme: YunfengTheme,
	left: string,
	segments: StatusSegment[],
	width: number,
	gapWidth: number,
): string {
	const parts: string[] = [paint(left, theme)];
	if (segments.length > 0) {
		parts.push(paint(' '.repeat(gapWidth), theme));
		parts.push(
			segments
				.map((segment) => paint(segment.text, theme, segment.color(theme), segment.bold))
				.join(paint(SEPARATOR, theme, theme.border)),
		);
	}
	const used = visibleWidth(parts.join(''));
	parts.push(paint(' '.repeat(Math.max(0, width - used)), theme));
	return parts.join('');
}

export class StatusBar implements Component {
	constructor(private info: () => StatusInfo) {}

	invalidate(): void {}

	render(width: number): string[] {
		const viewport = Math.max(1, width);
		const theme = getYunfengTheme();
		const info = this.info();
		const left = ` ${sanitizeStatusText(info.cwd)}`;
		const segments = buildSegments(info);
		const leftWidth = visibleWidth(left);
		const rightWidth = segmentsPlainWidth(segments);

		// 全部放得下：标准两端布局
		if (leftWidth + GAP_WIDTH + rightWidth <= viewport) {
			const padding = viewport - leftWidth - GAP_WIDTH - rightWidth;
			return [assembleLine(theme, left + ' '.repeat(padding), segments, viewport, GAP_WIDTH)];
		}

		// 放不下：给左侧保留约 30% 宽度（右侧信息更有用），右侧按优先级收纳后，左侧占满剩余空间
		const minLeftWidth = Math.min(leftWidth, Math.max(8, Math.floor(viewport * 0.3)));
		const rightBudget = Math.max(0, viewport - minLeftWidth - GAP_WIDTH);
		const fitted = fitSegments(segments, rightBudget);
		const fittedWidth = segmentsPlainWidth(fitted);
		const gapWidth = fitted.length > 0 ? GAP_WIDTH : 0;
		const leftBudget = Math.max(1, viewport - fittedWidth - gapWidth);
		const fittedLeft = truncateToWidth(left, leftBudget, ELLIPSIS);
		return [assembleLine(theme, fittedLeft, fitted, viewport, gapWidth)];
	}
}
