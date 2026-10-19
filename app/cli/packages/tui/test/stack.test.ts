import { describe, expect, it } from 'vitest';
import { VStack } from '../src/layout/v-stack.js';
import { HStack } from '../src/layout/h-stack.js';
import type { Component } from '../src/tui.js';
import { stripTerminalSequences } from '../src/utils.js';

/** 固定行数的测试组件，记录最近一次收到的 width/height */
class Fixed implements Component {
	lastWidth = -1;
	lastHeight: number | undefined;
	constructor(private lines: string[]) {}
	invalidate(): void {}
	render(width: number, height?: number): string[] {
		this.lastWidth = width;
		this.lastHeight = height;
		return this.lines;
	}
}

const plain = (rows: string[]) => rows.map((r) => stripTerminalSequences(r));

describe('VStack flex', () => {
	it('grow fills remaining height and passes allocated size to child', () => {
		const a = new Fixed(['a1', 'a2']);
		const b = new Fixed(['b']);
		const c = new Fixed(['c']);
		const v = new VStack([{ component: a }, { component: b, grow: 1 }, { component: c }]);
		const rows = v.render(20, 10);
		// 总行数 = 可用高度 10
		expect(rows.length).toBe(10);
		// b 分配 10 - 2 - 1 = 7 行，且收到 height=7
		expect(b.lastHeight).toBe(7);
		// 第 3..9 行是 b 的内容 + 补空行
		expect(plain(rows)[2]).toBe('b');
		expect(rows[8]).toBe('');
	});

	it('without height keeps intrinsic sizes (no padding)', () => {
		const a = new Fixed(['a1', 'a2']);
		const b = new Fixed(['b']);
		const v = new VStack([{ component: a, grow: 1 }, { component: b }]);
		const rows = v.render(20);
		expect(rows.length).toBe(3);
		// 未提供可用高度时，子组件收到固有行数（1），不额外补行
		expect(b.lastHeight).toBe(1);
	});

	it('clips child rows to allocated size', () => {
		const a = new Fixed(['a1', 'a2', 'a3', 'a4', 'a5']);
		const b = new Fixed(['b']);
		const v = new VStack([{ component: a, basis: 2 }, { component: b }]);
		const rows = v.render(20, 3);
		expect(plain(rows)).toEqual(['a1', 'a2', 'b']);
	});

	it('respects minSize and maxSize', () => {
		const a = new Fixed(['a']);
		const b = new Fixed(['b']);
		const v = new VStack([
			{ component: a, grow: 1, minSize: 4 },
			{ component: b, grow: 1, maxSize: 2 },
		]);
		const rows = v.render(20, 10);
		expect(rows.length).toBe(10);
		// a >= 4，b <= 2
		expect(a.lastHeight).toBeGreaterThanOrEqual(4);
		expect(b.lastHeight).toBeLessThanOrEqual(2);
	});

	it('inserts gap rows between children', () => {
		const a = new Fixed(['a']);
		const b = new Fixed(['b']);
		const v = new VStack([{ component: a }, { component: b }], { gap: 1 });
		const rows = v.render(20);
		expect(plain(rows)).toEqual(['a', '', 'b']);
	});
});

describe('HStack flex', () => {
	it('allocates column widths by basis', () => {
		const a = new Fixed(['aaaaa']);
		const b = new Fixed(['bbbbbbbbbbbbbbb']);
		const h = new HStack([
			{ component: a, basis: 5 },
			{ component: b, basis: 15 },
		]);
		h.render(20);
		expect(a.lastWidth).toBe(5);
		expect(b.lastWidth).toBe(15);
	});

	it('grow distributes extra width by ratio', () => {
		const a = new Fixed(['a']);
		const b = new Fixed(['b']);
		const h = new HStack([
			{ component: a, basis: 2, grow: 1 },
			{ component: b, basis: 2, grow: 3 },
		]);
		h.render(10);
		// 基础 2+2，多余 6 按 1:3 分配 → a=2+1=3, b=2+4=6，余量 1 给最后一个 grow 项 → b=7
		expect(a.lastWidth).toBe(3);
		expect(b.lastWidth).toBe(7);
	});

	it('align center vertically centers shorter column', () => {
		const a = new Fixed(['aaaaa', 'aaaaa', 'aaaaa']);
		const b = new Fixed(['bbbbb']);
		const h = new HStack(
			[
				{ component: a, basis: 5 },
				{ component: b, basis: 5 },
			],
			{ gap: 1, align: 'center' },
		);
		const rows = plain(h.render(20));
		// 3 行 vs 1 行，居中后 b 出现在中间行
		expect(rows[0]).toBe('aaaaa ');
		expect(rows[1]).toBe('aaaaa bbbbb');
		expect(rows[2]).toBe('aaaaa ');
	});

	it('align end bottom-aligns shorter column', () => {
		const a = new Fixed(['aaaaa', 'aaaaa']);
		const b = new Fixed(['bbbbb']);
		const h = new HStack(
			[
				{ component: a, basis: 5 },
				{ component: b, basis: 5 },
			],
			{ gap: 1, align: 'end' },
		);
		const rows = plain(h.render(20));
		expect(rows[0]).toBe('aaaaa ');
		expect(rows[1]).toBe('aaaaa bbbbb');
	});
});
