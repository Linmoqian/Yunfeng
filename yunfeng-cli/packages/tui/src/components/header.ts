/**
 * Header：Yunfeng 品牌头部组件。
 * 左侧为云朵标识 + Yunfeng 词标，右侧展示会话/模型等上下文；
 * 底部用主题分割线收边，对齐 Web 工作台头部结构。
 */
import { style } from '../terminal/ansi.js';
import { getYunfengTheme } from '../theme.js';
import { truncateToWidth, visibleWidth } from '../utils.js';
import type { Component } from './component.js';

export interface HeaderInfo {
	/** 词标（默认 Yunfeng） */
	title?: string;
	/** 右侧上下文，如会话名 / 模型 */
	detail?: string;
}

export class Header implements Component {
	constructor(private info: () => HeaderInfo = () => ({})) {}

	invalidate(): void {}

	render(width: number): string[] {
		const theme = getYunfengTheme();
		const info = this.info();
		const left = ` ${style('☁', { fg: theme.brand, bold: true })} ${style(info.title ?? 'Yunfeng', {
			fg: theme.text,
			bold: true,
		})}`;
		const right = info.detail ? style(info.detail, { fg: theme.textSecondary }) : '';
		const leftWidth = visibleWidth(left);
		const rightWidth = visibleWidth(right);
		const pad = Math.max(1, width - leftWidth - rightWidth - 1);
		const titleRow = `${left}${' '.repeat(pad)}${right}`;
		const rule = style('─'.repeat(Math.max(1, width)), { fg: theme.divider });
		return [truncateToWidth(titleRow, width), rule];
	}
}
