import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';
import type { Terminal } from '@yunfeng/tui';
import { stripTerminalSequences } from '@yunfeng/tui';

class MemoryTerminal implements Terminal {
	output = '';
	cols = 80;
	rows = 24;
	private inputHandler: ((d: string) => void) | null = null;

	start(onInput: (d: string) => void): void {
		this.inputHandler = onInput;
	}
	stop(): void {
		this.inputHandler = null;
	}
	write(data: string): void {
		this.output += data;
	}
	get columns(): number {
		return this.cols;
	}
	get rows(): number {
		return this.rows;
	}
	hideCursor(): void {
		this.output += '\x1b[?25l';
	}
	showCursor(): void {
		this.output += '\x1b[?25h';
	}
	clearScreen(): void {
		this.output += '\x1b[2J\x1b[H';
	}
	emit(data: string): void {
		this.inputHandler?.(data);
	}
}

describe('createApp', () => {
	it('renders welcome content on first frame', () => {
		const term = new MemoryTerminal();
		const { tui } = createApp(term);
		tui.start();
		tui.renderNow(true);
		const text = stripTerminalSequences(term.output);
		expect(text).toContain('欢迎使用 yunfeng-cli TUI');
		expect(text).toContain('yunfeng');
		expect(text).toContain('█'); // 吉祥物
	});

	it('submit writes message to stream and clears editor', () => {
		const term = new MemoryTerminal();
		const { tui, messages, editor } = createApp(term);
		tui.start();
		tui.renderNow(true);
		for (const ch of 'hi') term.emit(ch);
		term.emit('\r');
		tui.renderNow(true);
		expect(messages.items.some((m) => m.content === 'hi')).toBe(true);
		expect(!editor.value.includes('hi')).toBe(true);
	});

	it('global ctrl+c shortcut fires onQuit', () => {
		const term = new MemoryTerminal();
		let fired = false;
		const { tui } = createApp(term, { onQuit: () => (fired = true) });
		tui.start();
		term.emit('\x03');
		expect(fired).toBe(true);
	});

	it('layout pushes editor/status to bottom via grow', () => {
		const term = new MemoryTerminal();
		const { tui } = createApp(term);
		tui.start();
		tui.renderNow(true);
		const lines = stripTerminalSequences(term.output).split('\n');
		// 输出含状态栏路径与编辑器提示
		expect(lines.some((l) => l.includes(process.cwd()))).toBe(true);
		expect(lines.some((l) => l.includes('❯'))).toBe(true);
	});
});
