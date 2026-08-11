/**
 * 状态栏组件：展示工作目录、会话名、token/上下文等元信息。
 * v1 只渲染静态数据位，后续接入 agent 后填充真实数值。
 */
import { style } from '../terminal/ansi.js';
import type { Component } from './component.js';

export interface StatusInfo {
	cwd: string;
	sessionName: string;
	/** 模型名（未接入时为空） */
	model?: string;
	/** token 计数（未接入时为 0） */
	tokens?: number;
	/** 当前总额计开销（美元） */
	cost?: number;
}

export class StatusBar implements Component {
	constructor(private info: () => StatusInfo) {}

	invalidate(): void {}

	render(width: number): string[] {
		const info = this.info();
		const left = ` ${info.cwd}`;
		const right = [
			info.sessionName ? `📁 ${info.sessionName}` : '',
			info.model ? `🤖 ${info.model}` : '',
			info.tokens ? `⨁ ${info.tokens}` : '',
			info.cost ? `$${info.cost.toFixed(2)}` : '',
		]
			.filter((s) => s !== '')
			.join(' · ');

		const padding = Math.max(1, width - left.length - right.length - 2);
		const line = `${left}${' '.repeat(padding)} ${right} `;
		return [style(line, { bg: '#21262d', fg: '#8b949e' })];
	}
}
