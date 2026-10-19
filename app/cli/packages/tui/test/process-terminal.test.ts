import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { ProcessTerminal } from '../src/terminal/process-terminal.js';
import { applyDetectedThemeMode, getYunfengThemeMode, setThemePreference } from '../src/theme.js';

afterEach(() => {
	setThemePreference('dark');
});

describe('ProcessTerminal 主题探测', () => {
	it('查询 OSC 10/11，响应驱动 onThemeMode 且不进入按键流', () => {
		const stdin = new PassThrough();
		const stdout = new PassThrough();
		const terminal = new ProcessTerminal(
			stdin as unknown as NodeJS.ReadStream,
			stdout as unknown as NodeJS.WriteStream,
		);
		let keys = '';
		let detected: 'light' | 'dark' | null = null;
		terminal.onThemeMode = (mode) => {
			detected = mode;
			applyDetectedThemeMode(mode);
		};

		terminal.start(
			(data) => {
				keys += data;
			},
			() => {},
		);
		terminal.queryColorScheme();
		stdin.write('\x1b]10;#f5f5f7\x07\x1b]11;rgb:ffff/ffff/ffff\x1b\\x');
		terminal.stop();

		expect(detected).toBe('light');
		expect(getYunfengThemeMode()).toBe('light');
		expect(keys).toBe('x');
		const output = stdout.read()?.toString() ?? '';
		expect(output).toContain('\x1b]10;?\x07');
		expect(output).toContain('\x1b]11;?\x07');
	});
});
