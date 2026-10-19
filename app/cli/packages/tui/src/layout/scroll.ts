/**
 * Scroll：通用滚动容器。
 * 包装任意子组件，按可用高度裁剪为视口窗口，支持 scrollBy/setScroll
 * 与聚焦时 ↑/↓/PgUp/PgDn 滚动。
 */
import { parseKey } from '../terminal/input.js';
import type { Component, Focusable } from '../tui.js';

export class Scroll implements Component, Focusable {
	/** 被包装的内容组件 */
	content: Component;
	/** 滚动偏移：0 表示最新（底部） */
	scroll = 0;
	/** 可聚焦以支持键盘滚动 */
	focused = false;
	/** 当前视口下可回看的最大行数（render 时更新） */
	maxScroll = 0;
	/** 每次翻页的行数（PgUp/PgDn） */
	pageSize = 10;

	constructor(content: Component, pageSize = 10) {
		this.content = content;
		this.pageSize = pageSize;
	}

	invalidate(): void {
		this.content.invalidate();
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
			return false;
		}
		if (key.kind === 'pageup') {
			this.scrollBy(this.pageSize);
			return true;
		}
		if (key.kind === 'pagedown') {
			this.scrollBy(-this.pageSize);
			return true;
		}
		return false;
	}

	render(width: number, height?: number): string[] {
		const all = this.content.render(width);
		// 未提供高度时返回全部内容行
		if (height === undefined || height <= 0) return all;

		const viewport = Math.max(1, height);
		this.maxScroll = Math.max(0, all.length - viewport);
		const s = Math.min(this.scroll, this.maxScroll);
		const end = all.length - s;
		const start = Math.max(0, end - viewport);
		return all.slice(start, end);
	}
}
