import { describe, expect, it } from 'vitest';
import { Markdown, renderMarkdown } from '../src/components/markdown.js';
import { stripTerminalSequences, visibleWidth } from '../src/utils.js';

const plain = (rows: string[]) => rows.map((r) => stripTerminalSequences(r));

describe('Markdown', () => {
	it('renders heading bold', () => {
		const rows = renderMarkdown('# 标题', 40);
		expect(rows[0]).toMatch(/\x1b\[1;/); // bold 参数（与前景色合并）
		expect(plain(rows)[0]).toBe('标题');
	});

	it('renders bold/italic/inline-code/link', () => {
		const rows = renderMarkdown('**粗** *斜* `码` [链接](https://a.b)', 60);
		const line = rows[0] ?? '';
		expect(line).toContain('\x1b[1m'); // bold
		expect(line).toContain('\x1b[3m'); // italic
		expect(line).toMatch(/48;2;\d+;\d+;\d+/); // 行内代码背景（主题 surface）
		expect(line).toContain('\x1b[4;'); // underline（链接）
		expect(plain(rows)[0]).toBe('粗 斜 码 链接');
	});

	it('renders code block with background', () => {
		const rows = renderMarkdown('```ts\nconst x = 1;\n```', 40);
		expect(rows[0]).toMatch(/48;2;\d+;\d+;\d+/);
		expect(plain(rows)[0]).toContain('const x = 1;');
	});

	it('renders list marker', () => {
		const rows = renderMarkdown('- 项目一\n2. 项目二', 40);
		expect(plain(rows)[0]).toBe('• 项目一');
		expect(plain(rows)[1]).toBe('2. 项目二');
	});

	it('renders quote and rule', () => {
		const rows = renderMarkdown('> 引用\n---', 40);
		expect(plain(rows)[0]).toBe('▌ 引用');
		expect(rows[1]).toContain('─');
	});

	it('wraps long paragraph by width', () => {
		const md = new Markdown('这是一段很长的中文内容，用于验证折行是否按可见宽度正确换行。');
		const rows = md.render(10);
		expect(rows.length).toBeGreaterThan(1);
		for (const row of rows) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(10);
		}
	});
});

describe('Markdown theme', () => {
	it('applies custom heading color', () => {
		const rows = renderMarkdown('# 标题', 40, {
			heading: (t) => `\x1b[35m${t}\x1b[0m`,
		});
		expect(rows[0]).toContain('\x1b[35m');
		expect(stripTerminalSequences(rows[0])).toBe('标题');
	});

	it('keeps default theme when omitted', () => {
		const rows = renderMarkdown('# 标题', 40);
		expect(rows[0]).toMatch(/\x1b\[1;/); // 默认 bold
	});
});
