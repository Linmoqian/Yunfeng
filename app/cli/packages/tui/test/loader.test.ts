import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Loader } from '../src/components/loader.js';
import { stripTerminalSequences } from '../src/utils.js';

describe('Loader', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('renders nothing when inactive', () => {
		const l = new Loader('思考中');
		expect(l.render(40)).toEqual([]);
	});

	it('renders spinner and message when active', () => {
		const l = new Loader('思考中');
		l.setActive(true);
		const text = stripTerminalSequences(l.render(40).join(''));
		expect(text).toContain('思考中');
		expect(text.length).toBeGreaterThan(0);
	});

	it('advances frames on interval and calls onFrame', () => {
		const onFrame = vi.fn();
		const l = new Loader('x', { intervalMs: 50, onFrame });
		l.setActive(true);
		expect(onFrame).not.toHaveBeenCalled();
		vi.advanceTimersByTime(50);
		expect(onFrame).toHaveBeenCalledTimes(1);
	});

	it('stop halts animation and hides after setActive(false)', () => {
		const onFrame = vi.fn();
		const l = new Loader('x', { intervalMs: 50, onFrame });
		l.setActive(true);
		l.setActive(false);
		vi.advanceTimersByTime(200);
		expect(onFrame).not.toHaveBeenCalled();
		expect(l.render(40)).toEqual([]);
	});
});
