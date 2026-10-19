import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getColorMode, setColorMode, style } from '../src/terminal/ansi.js';
import { detectColorMode } from '../src/terminal/process-terminal.js';

describe('color mode', () => {
	const original = getColorMode();
	beforeEach(() => setColorMode('truecolor'));
	afterEach(() => setColorMode(original));

	it('none disables color output', () => {
		setColorMode('none');
		expect(style('x', { fg: '#ff0000' })).toBe('x');
		expect(style('x', { fg: 'red', bold: true })).toBe('\x1b[1mx\x1b[0m'); // bold 仍保留
	});

	it('256 quantizes truecolor', () => {
		setColorMode('256');
		const out = style('x', { fg: '#ff0000' });
		expect(out).toContain('38;5;'); // 256 色序列
		expect(out).not.toContain('38;2;'); // 非 truecolor
	});

	it('16 maps truecolor to nearest basic color', () => {
		setColorMode('16');
		const out = style('x', { fg: '#ff0000' });
		expect(out).toContain('31'); // red
		const white = style('x', { fg: '#ffffff' });
		expect(white).toContain('37'); // white
	});

	it('detectColorMode honors NO_COLOR', () => {
		expect(detectColorMode({ NO_COLOR: '1' } as NodeJS.ProcessEnv)).toBe('none');
	});

	it('detectColorMode honors TERM=dumb and 256color', () => {
		expect(detectColorMode({}, 'dumb')).toBe('none');
		expect(detectColorMode({}, 'xterm-256color')).toBe('256');
		expect(detectColorMode({ COLORTERM: 'truecolor' }, 'xterm-256color')).toBe('truecolor');
	});
});
