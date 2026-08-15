import { describe, expect, it } from 'vitest';
import { StatusBar, formatTokens } from '../src/components/status.js';
import { stripTerminalSequences, visibleWidth } from '../src/utils.js';

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

	it('keeps every line exactly within terminal width', () => {
		const info = {
			cwd: '/Volumes/base/project/Yunfeng/.worktrees/yunfeng-tui',
			sessionName: '很长的会话名称用于检查',
			model: 'pi:compatible',
			contextUsed: 12480,
			contextLimit: 128000,
			reasoning: 'high' as const,
			cost: 0.01,
		};
		for (const width of [120, 80, 60, 40, 30, 20, 12, 8, 1]) {
			const rows = new StatusBar(() => info).render(width);
			expect(rows).toHaveLength(1);
			expect(visibleWidth(rows[0] ?? '')).toBe(width);
		}
	});

	it('truncates long cwd and drops low-priority right segments on narrow screens', () => {
		const bar = new StatusBar(() => ({
			cwd: '/Volumes/base/project/Yunfeng/.worktrees/yunfeng-tui',
			sessionName: '新会话',
			model: 'yunfeng:demo',
			contextUsed: 12480,
			contextLimit: 128000,
			reasoning: 'medium',
			cost: 0.01,
		}));
		const narrow = stripTerminalSequences(bar.render(40).join(''));
		expect(narrow).toContain('…');
		expect(narrow).toContain('新会话');
		expect(narrow).toContain('🤖'); // 模型优先级高于 reasoning/context/cost
		expect(narrow).not.toContain('$0.01'); // 窄屏优先丢弃右侧开销
	});

	it('sanitizes newlines and tabs in cwd/session', () => {
		const bar = new StatusBar(() => ({ cwd: '/a\nb\tc', sessionName: 's\ne' }));
		const text = stripTerminalSequences(bar.render(80).join(''));
		expect(text).toContain('/a b c');
		expect(text).toContain('s e');
		expect(text).not.toContain('\n');
	});

	it('colors critical context usage with error semantic', () => {
		const bar = new StatusBar(() => ({
			cwd: '/proj',
			sessionName: 's',
			contextUsed: 120000,
			contextLimit: 128000,
		}));
		const row = bar.render(80)[0] ?? '';
		// 高占用片段包含 error token 的 truecolor 序列
		expect(row).toContain('38;2;255;69;58');
	});
});
