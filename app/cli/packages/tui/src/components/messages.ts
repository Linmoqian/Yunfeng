/**
 * 消息流组件：按时间顺序渲染用户 / 助手 / 工具事件。
 * 每类消息用不同前缀与颜色区分，后续接入 agent 时由事件池驱动。
 *
 * 滚动语义：scroll=0 表示贴底（最新）；scroll>0 表示向上回看的历史行数。
 * 收到可用高度（height）时只渲染视口内最近的内容行。
 */
import { style } from '../terminal/ansi.js';
import { getYunfengTheme, type YunfengTheme } from '../theme.js';
import { parseKey } from '../terminal/input.js';
import { renderMarkdown } from './markdown.js';
import type { Component, Focusable } from './component.js';

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system' | 'error';

export interface Message {
	role: MessageRole;
	/** 展示名，如 "You"、"assistant"、"tool" */
	from: string;
	content: string;
	/** 附加错误或元信息 */
	meta?: string;
	/** 角色前缀 emoji */
	icon?: string;
}

const ROLE_ICON: Record<MessageRole, string> = {
	user: '❯',
	assistant: '◆',
	tool: '▸',
	system: 'ℹ',
	error: '✗',
};

/** 角色色跟随 Yunfeng 语义 token：用户=品牌，助手=成功，工具=信息，错误=错误色 */
function roleColor(role: MessageRole, theme: YunfengTheme): string {
	switch (role) {
		case 'user':
			return theme.brand;
		case 'assistant':
			return theme.success;
		case 'tool':
			return theme.info;
		case 'error':
			return theme.error;
		case 'system':
			return theme.textSecondary;
	}
}

export class Messages implements Component, Focusable {
	items: Message[] = [];
	/** 滚动偏移：0 表示贴底（最新），正数表示向上回看的行数 */
	scroll = 0;
	/** 可聚焦以支持键盘滚动（↑/↓） */
	focused = false;
	/** 当前视口下可回看的最大行数（render 时更新） */
	maxScroll = 0;

	constructor(items: Message[] = []) {
		this.items = items;
	}

	invalidate(): void {}

	add(msg: Message): void {
		// 贴底时保持贴底；回看历史时保持当前位置，不强制跳回
		const wasAtBottom = this.scroll === 0;
		this.items.push(msg);
		if (wasAtBottom) this.scroll = 0;
	}

	/** 向上/下滚动（正数=上翻） */
	scrollBy(delta: number): void {
		this.scroll = Math.max(0, this.scroll + delta);
	}

	setScroll(n: number): void {
		this.scroll = Math.max(0, n);
	}

	handleInput(data: string): boolean {
		if (!this.focused) return false;
		const parsed = parseKey(data);
		if (!parsed) return false;
		const key = parsed.key;
		if (key.kind === 'arrow') {
			if (key.direction === 'up') {
				this.scrollBy(1);
				return true;
			}
			if (key.direction === 'down') {
				this.scrollBy(-1);
				return true;
			}
		}
		return false;
	}

	private renderMessage(msg: Message, width: number): string[] {
		const theme = getYunfengTheme();
		const icon = msg.icon ?? ROLE_ICON[msg.role];
		const header = style(`${icon} ${msg.from}`, { fg: roleColor(msg.role, theme) });
		const lines: string[] = [`${header}`];
		// 消息内容按 markdown 渲染（支持标题/粗体/代码块/列表等）
		for (const raw of renderMarkdown(msg.content || '', Math.max(1, width - 2))) {
			lines.push(`  ${raw}`);
		}
		if (msg.meta) {
			lines.push(style(`  ${msg.meta}`, { fg: getYunfengTheme().textSecondary, dim: true }));
		}
		return lines;
	}

	render(width: number, height?: number): string[] {
		const allRows: string[] = [];
		for (const msg of this.items) {
			allRows.push(...this.renderMessage(msg, width));
		}
		// 未提供高度时返回全部内容行
		if (height === undefined || height <= 0) return allRows;

		const viewport = Math.max(1, height);
		const total = allRows.length;
		this.maxScroll = Math.max(0, total - viewport);
		const s = Math.min(this.scroll, this.maxScroll);
		const end = total - s;
		const start = Math.max(0, end - viewport);
		return allRows.slice(start, end);
	}
}
