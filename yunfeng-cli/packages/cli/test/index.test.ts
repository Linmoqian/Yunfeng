import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';
import { getYunfengThemeMode, setThemePreference, stripTerminalSequences, type Terminal } from '@yunfeng/tui';

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

afterEach(() => {
	// CLI 测试可能切换主题；恢复默认深色避免串到其它用例
	setThemePreference('dark');
});

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

	it('fullscreen option renders into alt screen and restores on stop', () => {
		const term = new MemoryTerminal();
		const { tui } = createApp(term, { screen: 'full' });
		tui.start();
		expect(term.output).toContain('\x1b[?1049h');
		tui.stop();
		expect(term.output).toContain('\x1b[?1049l');
	});

	it('/help opens overlay and Enter closes back to editor', () => {
		const term = new MemoryTerminal();
		const { tui, editor } = createApp(term);
		tui.start();
		tui.renderNow(true);
		for (const ch of '/help') term.emit(ch);
		term.emit('\r');
		tui.renderNow(true);
		expect(stripTerminalSequences(term.output)).toContain('帮助');
		expect(tui.getFocusedComponent()).not.toBe(editor);
		term.emit('\r');
		tui.renderNow(true);
		expect(tui.getFocusedComponent()).toBe(editor);
	});

	it('/clear empties message stream', () => {
		const term = new MemoryTerminal();
		const { tui, messages } = createApp(term);
		tui.start();
		for (const ch of '/clear') term.emit(ch);
		term.emit('\r');
		expect(messages.items).toHaveLength(1);
		expect(messages.items[0]?.content).toBe('消息流已清空。');
	});

	it('/model opens picker and updates status model', () => {
		const term = new MemoryTerminal();
		const { tui, messages, status } = createApp(term);
		tui.start();
		for (const ch of '/model') term.emit(ch);
		term.emit('\r');
		term.emit('\r'); // 选择第一项
		expect(messages.items.some((m) => m.content.includes('已选择模型'))).toBe(true);
		const text = stripTerminalSequences(status.render(80).join(''));
		expect(text).toContain('yunfeng:demo');
	});

	it('/theme light switches theme immediately', () => {
		const term = new MemoryTerminal();
		const { tui } = createApp(term);
		tui.start();
		for (const ch of '/theme light') term.emit(ch);
		term.emit('\r');
		expect(getYunfengThemeMode()).toBe('light');
	});

	it('/quit fires onQuit and unknown command reports error', () => {
		const term = new MemoryTerminal();
		let fired = false;
		const { tui, messages } = createApp(term, { onQuit: () => (fired = true) });
		tui.start();
		for (const ch of '/quit') term.emit(ch);
		term.emit('\r');
		expect(fired).toBe(true);

		for (const ch of '/nope') term.emit(ch);
		term.emit('\r');
		expect(messages.items.some((m) => m.role === 'error' && m.content.includes('/nope'))).toBe(true);
	});
});
