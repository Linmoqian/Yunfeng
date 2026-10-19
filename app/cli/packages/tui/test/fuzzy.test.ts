import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from '../src/fuzzy.js';

describe('fuzzyMatch', () => {
	it('matches subsequence characters in order', () => {
		const m = fuzzyMatch('abc', 'xaybzc');
		expect(m).not.toBeNull();
		expect(m!.indexes).toEqual([1, 3, 5]);
	});

	it('returns null when order violated', () => {
		expect(fuzzyMatch('abc', 'cba')).toBeNull();
		expect(fuzzyMatch('zz', 'abc')).toBeNull();
	});

	it('empty query matches everything', () => {
		expect(fuzzyMatch('', 'anything')!.score).toBe(0);
	});

	it('is case-insensitive with bonus for exact case', () => {
		const exact = fuzzyMatch('AB', 'AB')!;
		const lower = fuzzyMatch('ab', 'AB')!;
		expect(exact.score).toBeGreaterThan(lower.score);
	});

	it('word start gets higher score', () => {
		const wordStart = fuzzyMatch('ab', 'ab cd')!;
		const mid = fuzzyMatch('ab', 'xab')!;
		expect(wordStart.score).toBeGreaterThan(mid.score);
	});

	it('consecutive match scores higher than scattered', () => {
		const consecutive = fuzzyMatch('abc', 'abc')!;
		const scattered = fuzzyMatch('abc', 'a1b2c')!;
		expect(consecutive.score).toBeGreaterThan(scattered.score);
	});
});

describe('fuzzyFilter', () => {
	const items = [{ name: 'resume 2026' }, { name: 'model gpt-4o' }, { name: 'refactor layout' }];

	it('returns all items for empty query', () => {
		expect(fuzzyFilter('', items, (x) => x.name)).toEqual(items);
	});

	it('filters and ranks by score', () => {
		const result = fuzzyFilter('mo', items, (x) => x.name);
		expect(result.length).toBe(1);
		expect(result[0]!.name).toBe('model gpt-4o');
	});

	it('word-start prefix ranks above scattered', () => {
		const result = fuzzyFilter('re', items, (x) => x.name);
		expect(result[0]!.name).toBe('resume 2026'); // re 词首
		expect(result[1]!.name).toBe('refactor layout'); // 也词首，但 re 位置更靠前
	});
});
