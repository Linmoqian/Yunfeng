import { describe, expect, it } from 'vitest';
import { TuiFullScreen } from '../src/tui-full-screen.js';
import type { Terminal } from '../src/tui.js';
import { Text } from '../src/layout/text.js';
import { stripTerminalSequences } from '../src/utils.js';

class FakeTerminal implements Terminal {
	output = '';
	cols = 40;
	rows = 10;
	started = false;
	start(): void {
		this.started = true;
	}
	stop(): void {
		this.started = false;
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
}

function build() {
	const term = new FakeTerminal();
	const tui = new TuiFullScreen({ terminal: term });
	tui.addChild(new Text('hello fullscreen'));
	return { term, tui };
}

describe('TuiFullScreen', () => {
	it('start switches to alt screen and clears', () => {
		const { tui, term } = build();
		tui.start();
		tui.renderNow(true);
		expect(term.output).toContain('\x1b[?1049h');
		expect(term.output).toContain('\x1b[2J');
		expect(stripTerminalSequences(term.output)).toContain('hello fullscreen');
	});

	it('stop exits alt screen and restores cursor', () => {
		const { tui, term } = build();
		tui.start();
		tui.renderNow(true);
		term.output = '';
		tui.stop();
		expect(term.output).toContain('\x1b[?1049l');
		expect(term.output).toContain('\x1b[?25h');
	});

	it('stop with preserveScreen keeps alt screen', () => {
		const { tui, term } = build();
		tui.start();
		tui.renderNow(true);
		term.output = '';
		tui.stop({ preserveScreen: true });
		expect(term.output).not.toContain('\x1b[?1049l');
	});

	it('no change on second render outputs no redraw', () => {
		const { tui, term } = build();
		tui.start();
		tui.renderNow(true);
		term.output = '';
		tui.renderNow(true);
		expect(term.output).not.toContain('\x1b[2K');
	});
});
