import { afterEach, describe, expect, it } from 'vitest';
import { Header } from '../src/components/header.js';
import { setThemePreference } from '../src/theme.js';
import { stripTerminalSequences } from '../src/utils.js';

afterEach(() => {
	setThemePreference('dark');
});

describe('Header', () => {
	it('renders Yunfeng wordmark and detail', () => {
		const header = new Header(() => ({ detail: '新会话 · yunfeng:demo' }));
		const rows = header.render(60);
		expect(rows).toHaveLength(2);
		const text = stripTerminalSequences(rows[0] ?? '');
		expect(text).toContain('Yunfeng');
		expect(text).toContain('新会话 · yunfeng:demo');
		expect(stripTerminalSequences(rows[1] ?? '')).toBe('─'.repeat(60));
	});

	it('narrow width does not overflow', () => {
		const header = new Header(() => ({ detail: '很长的会话名' }));
		const rows = header.render(12);
		expect(rows).toHaveLength(2);
		expect(stripTerminalSequences(rows[0] ?? '').length).toBeLessThanOrEqual(12);
	});
});
