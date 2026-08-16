import { describe, expect, it } from 'vitest';
import {
	applyBackgroundToLine,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from '../src/utils.js';
import { style } from '../src/terminal/ansi.js';

describe('visibleWidth', () => {
	it('counts ascii width', () => {
		expect(visibleWidth('hello')).toBe(5);
	});
	it('counts CJK wide chars as 2', () => {
		expect(visibleWidth('中')).toBe(2);
		expect(visibleWidth('你好')).toBe(4);
	});
	it('strips ANSI codes', () => {
		expect(visibleWidth(style('hi', { fg: 'red' }))).toBe(2);
	});
	it('mixed wide and ascii', () => {
		expect(visibleWidth('a中b')).toBe(4);
	});
	it('counts emoji presentation as 2 columns', () => {
		expect(visibleWidth('📁')).toBe(2);
		expect(visibleWidth('🤖')).toBe(2);
		expect(visibleWidth('a😀b')).toBe(4);
	});
	it('keeps text-presentation symbols at 1 column', () => {
		expect(visibleWidth('☁')).toBe(1);
		expect(visibleWidth('❯')).toBe(1);
	});
});

describe('stripTerminalSequences', () => {
	it('removes SGR and OSC', () => {
		expect(stripTerminalSequences(style('x', { bold: true }) + '\x1b]0;title\x07:y')).toBe('x:y');
	});
	it('returns identical when no escape', () => {
		const s = 'plain';
		expect(stripTerminalSequences(s)).toBe(s);
	});
});

describe('wrapTextWithAnsi', () => {
	it('splits long ascii into lines', () => {
		const lines = wrapTextWithAnsi('aaa bbb ccc ddd', 8);
		expect(lines.every((l) => visibleWidth(l) <= 8)).toBe(true);
		expect(lines.length).toBeGreaterThan(1);
	});
	it('keeps lines at or under width', () => {
		const lines = wrapTextWithAnsi('中文测试较长内容折行行为验证', 8);
		for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(8);
	});
	it('handles explicit newlines', () => {
		const lines = wrapTextWithAnsi('ab\ncd', 20);
		expect(lines).toHaveLength(2);
	});
	it('preserves ANSI style across long words', () => {
		const styled = style('thisisareallylongword', { underline: true });
		const lines = wrapTextWithAnsi(styled, 8);
		// 断行后样式应继续存在（strip 后内容完整）
		const joined = lines.map(stripTerminalSequences).join('');
		expect(joined).toContain('thisisareallylongword');
		expect(lines.some((l) => l.includes('\x1b'))).toBe(true);
	});
});

describe('truncateToWidth', () => {
	it('truncates long text with ellipsis', () => {
		// maxWidth = 文本3列 + 省略号3列
		const out = truncateToWidth('abcdefghijk', 6);
		expect(visibleWidth(out)).toBeLessThanOrEqual(6);
		expect(stripTerminalSequences(out)).toBe('abc...');
	});
	it('short text stays unchanged', () => {
		expect(truncateToWidth('hi', 10)).toBe('hi');
	});
	it('pads to exact width', () => {
		const out = truncateToWidth('hi', 6, '...', true);
		expect(visibleWidth(out)).toBe(6);
	});
	it('handles CJK truncation', () => {
		const out = truncateToWidth('你好世界', 4);
		expect(visibleWidth(out)).toBeLessThanOrEqual(4);
	});
});

describe('applyBackgroundToLine', () => {
	it('pads and applies bg', () => {
		const bg = (t: string) => `[${t}]`;
		const out = applyBackgroundToLine('ab', 6, bg);
		expect(out).toBe('[ab    ]');
	});
});
