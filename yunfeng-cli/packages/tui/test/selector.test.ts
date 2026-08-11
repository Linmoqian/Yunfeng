import { describe, expect, it, vi } from 'vitest';
import { Selector } from '../src/components/selector.js';

describe('Selector', () => {
	const opts = [
		{ value: 'a', label: 'Alpha' },
		{ value: 'b', label: 'Beta' },
		{ value: 'c', label: 'Gamma', disabled: true },
	];

	it('starts at first option', () => {
		const s = new Selector(opts);
		expect(s.selected).toBe(0);
	});

	it('moves down and wraps', () => {
		const s = new Selector(opts);
		s.handleInput('\x1b[B');
		expect(s.selected).toBe(1);
		s.handleInput('\x1b[B');
		expect(s.selected).toBe(1); // Gamma 被禁用，跳过
	});

	it('moves up and wraps', () => {
		const s = new Selector(opts, 1);
		s.handleInput('\x1b[A');
		expect(s.selected).toBe(0);
	});

	it('local render produces rows', () => {
		const s = new Selector(opts);
		const rows = s.render(40);
		expect(rows.length).toBeGreaterThan(0);
	});
});

describe('Selector confirm/cancel', () => {
	it('enter triggers onSelect with current option', () => {
		const opts = [
			{ value: 'a', label: 'A' },
			{ value: 'b', label: 'B' },
		];
		const onSelect = vi.fn();
		const s = new Selector(opts, 1, { onSelect });
		expect(s.handleInput('\r')).toBe(true);
		expect(onSelect).toHaveBeenCalledWith(opts[1]);
	});

	it('enter on disabled option does not fire onSelect', () => {
		const opts = [
			{ value: 'a', label: 'A', disabled: true },
			{ value: 'b', label: 'B' },
		];
		const onSelect = vi.fn();
		const s = new Selector(opts, 0, { onSelect });
		expect(s.handleInput('\r')).toBe(true);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('escape triggers onCancel', () => {
		const onCancel = vi.fn();
		const s = new Selector([{ value: 'a', label: 'A' }], 0, { onCancel });
		expect(s.handleInput('\x1b')).toBe(true);
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it('renders disabled option dimmed', () => {
		const s = new Selector([
			{ value: 'a', label: 'A', disabled: true },
			{ value: 'b', label: 'B' },
		]);
		const rows = s.render(40);
		expect(rows[0]).toMatch(/\x1b\[2;/); // dim 参数
	});
});
