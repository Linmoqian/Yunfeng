/**
 * 状态栏组件：展示工作目录、会话名、模型名、上下文占用、思考强度与开销。
 * 数据由 info() 提供（接入 agent 后填充真实数值）。
 */
import { style } from '../terminal/ansi.js';
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

export class StatusBar implements Component {
	constructor(private info: () => StatusInfo) {}

	invalidate(): void {}

	render(width: number): string[] {
		const info = this.info();
		const left = ` ${info.cwd}`;
		const context =
			info.contextUsed !== undefined
				? info.contextLimit !== undefined
					? `⨁ ${formatTokens(info.contextUsed)}/${formatTokens(info.contextLimit)}`
					: `⨁ ${formatTokens(info.contextUsed)}`
				: '';
		const right = [
			info.sessionName ? `📁 ${info.sessionName}` : '',
			info.model ? `🤖 ${info.model}` : '',
			info.reasoning ? `🧠 ${info.reasoning}` : '',
			context,
			info.cost ? `$${info.cost.toFixed(2)}` : '',
		]
			.filter((s) => s !== '')
			.join(' · ');

		const padding = Math.max(1, width - left.length - right.length - 2);
		const line = `${left}${' '.repeat(padding)} ${right} `;
		return [style(line, { bg: '#21262d', fg: '#8b949e' })];
	}
}
