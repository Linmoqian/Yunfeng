import type { Component } from '../tui.js';

/**
 * Spacer：渲染空行，用于布局占位。
 */
export class Spacer implements Component {
	private lines: number;
	constructor(lines = 1) {
		this.lines = lines;
	}
	setLines(lines: number): void {
		this.lines = lines;
		this.invalidate();
	}
	invalidate(): void {}
	render(_width: number): string[] {
		return Array.from({ length: this.lines }, () => '');
	}
}
