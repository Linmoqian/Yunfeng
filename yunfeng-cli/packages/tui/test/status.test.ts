import { describe, expect, it } from 'vitest';
import { StatusBar, formatTokens } from '../src/components/status.js';
import { stripTerminalSequences } from '../src/utils.js';

describe('formatTokens', () => {
	it('formats thousands as k', () => {
		expect(formatTokens(12480)).toBe('12.5k');
		expect(formatTokens(128000)).toBe('128k');
		expect(formatTokens(500)).toBe('500');
		expect(formatTokens(100000)).toBe('100k');
	});
});

describe('StatusBar', () => {
	it('renders model, reasoning and context usage', () => {
		const bar = new StatusBar(() => ({
			cwd: '/proj',
			sessionName: 's',
			model: 'gpt-5-codex',
			contextUsed: 12480,
			contextLimit: 128000,
			reasoning: 'high',
		}));
		const text = stripTerminalSequences(bar.render(80).join(''));
		expect(text).toContain('🤖 gpt-5-codex');
		expect(text).toContain('🧠 high');
		expect(text).toContain('⨁ 12.5k/128k');
	});

	it('omits absent fields', () => {
		const bar = new StatusBar(() => ({ cwd: '/proj', sessionName: 's' }));
		const text = stripTerminalSequences(bar.render(80).join(''));
		expect(text).not.toContain('🤖');
		expect(text).not.toContain('🧠');
		expect(text).not.toContain('⨁');
	});

	it('renders context used without limit', () => {
		const bar = new StatusBar(() => ({ cwd: '/proj', sessionName: 's', contextUsed: 300 }));
		expect(stripTerminalSequences(bar.render(80).join(''))).toContain('⨁ 300');
	});
});
