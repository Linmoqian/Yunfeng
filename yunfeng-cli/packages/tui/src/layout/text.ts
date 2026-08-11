import type { Component } from '../tui.js';
import { visibleWidth, wrapTextWithAnsi } from '../utils.js';

/**
 * Text：多行文本组件，按可见宽度折行。
 * 可选背景函数（bgFn）用于涂满整行背景。
 */
export class Text implements Component {
	private text: string;
	private customBgFn?: (text: string) => string;

	constructor(text = '', customBgFn?: (text: string) => string) {
		this.text = text;
		this.customBgFn = customBgFn;
	}

	setText(text: string): void {
		this.text = text;
		this.invalidate();
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines = wrapTextWithAnsi(this.text, width);
		if (!this.customBgFn) return lines;
		return lines.map((l) => {
			const w = visibleWidth(l);
			return this.customBgFn!(l + ' '.repeat(Math.max(0, width - w)));
		});
	}
}
