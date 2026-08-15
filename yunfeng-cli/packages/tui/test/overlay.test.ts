import { describe, expect, it } from 'vitest';
import { TuiMainScreen } from '../src/tui-main-screen.js';
import type { Terminal } from '../src/tui.js';
import { Overlay } from '../src/components/overlay.js';
import { Selector } from '../src/components/selector.js';
import { Text } from '../src/layout/text.js';
import { stripTerminalSequences } from '../src/utils.js';

class FakeTerminal implements Terminal {
	output = '';
	cols = 40;
	rows = 12;
	start(): void {}
	stop(): void {}
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
}

function build() {
	const term = new FakeTerminal();
	const tui = new TuiMainScreen({ terminal: term });
	tui.addChild(new Text('underlying content'));
	return { term, tui };
}

describe('Overlay', () => {
	it('renders bordered box with title and content', () => {
		const o = new Overlay({
			title: '选择模型',
			content: new Selector([
				{ value: 'a', label: 'A' },
				{ value: 'b', label: 'B' },
			]),
			width: 20,
		});
		const rows = o.render(40, 10);
		const text = stripTerminalSequences(rows.join('\n'));
		expect(text).toContain('┌');
		expect(text).toContain('└');
		expect(text).toContain('选择模型');
		expect(text).toContain('A');
		expect(text).toContain('B');
		expect(rows.length).toBe(10); // 占满视口
	});

	it('openOverlay hides underlying content and renders overlay only', () => {
		const { tui, term } = build();
		tui.start();
		tui.renderNow(true);
		expect(stripTerminalSequences(term.output)).toContain('underlying content');
		term.output = '';
		const sel = new Selector([{ value: 'a', label: 'A' }]);
		tui.openOverlay(new Overlay({ title: '选择', content: sel, width: 20 }), sel);
		tui.renderNow(true);
		const text = stripTerminalSequences(term.output);
		expect(text).toContain('选择');
		expect(text).not.toContain('underlying content');
	});

	it('closeOverlay restores underlying content', () => {
		const { tui, term } = build();
		tui.start();
		tui.renderNow(true);
		const sel = new Selector([{ value: 'a', label: 'A' }]);
		tui.openOverlay(new Overlay({ title: '选择', content: sel, width: 20 }), sel);
		tui.renderNow(true);
		term.output = '';
		tui.closeOverlay();
		tui.renderNow(true);
		expect(stripTerminalSequences(term.output)).toContain('underlying content');
	});

	it('openOverlay moves focus to overlay target', () => {
		const { tui } = build();
		const sel = new Selector([{ value: 'a', label: 'A' }]);
		tui.openOverlay(new Overlay({ title: '选择', content: sel, width: 20 }), sel);
		expect(tui.getFocusedComponent()).toBe(sel);
	});
	it('focused overlay closes on Enter and fires onClose', () => {
		const { tui } = build();
		let closed = false;
		const overlay = new Overlay({
			title: '帮助',
			content: new Text('说明'),
			width: 20,
			onClose: () => (closed = true),
		});
		tui.openOverlay(overlay, overlay);
		expect(overlay.focused).toBe(true);
		expect(overlay.handleInput('\r')).toBe(true);
		expect(closed).toBe(true);
	});
});
