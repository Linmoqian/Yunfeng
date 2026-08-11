import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StdinBuffer } from '../src/terminal/stdin-buffer.js';
import type { Key } from '../src/terminal/input.js';

function collect() {
	const chunks: Array<{ chunk: string; key: Key }> = [];
	const emit = (chunk: string, key: Key) => chunks.push({ chunk, key });
	return { chunks, emit };
}

describe('StdinBuffer', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('emits complete arrow sequence immediately', () => {
		const { chunks, emit } = collect();
		const sb = new StdinBuffer();
		sb.feed('\x1b[A', emit);
		expect(chunks.length).toBe(1);
		expect(chunks[0]!.key).toMatchObject({ kind: 'arrow', direction: 'up' });
	});

	it('merges escape sequence split across events', () => {
		const { chunks, emit } = collect();
		const sb = new StdinBuffer();
		sb.feed('\x1b', emit);
		expect(chunks.length).toBe(0); // 等待更多
		sb.feed('[A', emit);
		expect(chunks.length).toBe(1);
		expect(chunks[0]!.key).toMatchObject({ kind: 'arrow', direction: 'up' });
	});

	it('emits lone escape after timeout', () => {
		const { chunks, emit } = collect();
		const sb = new StdinBuffer(50);
		sb.feed('\x1b', emit);
		expect(chunks.length).toBe(0);
		vi.advanceTimersByTime(50);
		expect(chunks.length).toBe(1);
		expect(chunks[0]!.key).toEqual({ kind: 'escape' });
	});

	it('cancels esc timeout when sequence completes', () => {
		const { chunks, emit } = collect();
		const sb = new StdinBuffer(50);
		sb.feed('\x1b', emit);
		sb.feed('[A', emit);
		vi.advanceTimersByTime(100);
		// 序列已完整消费，不再输出多余 escape
		expect(chunks.length).toBe(1);
	});

	it('emits unparsable byte as unknown', () => {
		const { chunks, emit } = collect();
		const sb = new StdinBuffer();
		sb.feed('\x00', emit);
		expect(chunks.length).toBe(1);
		expect(chunks[0]!.key).toMatchObject({ kind: 'unknown' });
	});

	it('clear cancels pending escape timer', () => {
		const { chunks, emit } = collect();
		const sb = new StdinBuffer(50);
		sb.feed('\x1b', emit);
		sb.clear();
		vi.advanceTimersByTime(100);
		expect(chunks.length).toBe(0);
	});
});
