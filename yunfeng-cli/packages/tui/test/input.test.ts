import { describe, expect, it } from 'vitest';
import { parseKey } from '../src/terminal/input.js';

describe('parseKey', () => {
	it('parses printable char', () => {
		expect(parseKey('a')).toEqual({ key: { kind: 'char', value: 'a' }, consumed: 1 });
	});

	it('parses enter', () => {
		expect(parseKey('\n')).toMatchObject({ key: { kind: 'enter' }, consumed: 1 });
		expect(parseKey('\r')).toMatchObject({ key: { kind: 'enter' }, consumed: 1 });
	});

	it('parses backspace (0x7f and 0x08)', () => {
		expect(parseKey('\x7f')).toMatchObject({ key: { kind: 'backspace' } });
		expect(parseKey('\x08')).toMatchObject({ key: { kind: 'backspace' } });
	});

	it('parses ctrl-c', () => {
		expect(parseKey('\x03')).toEqual({ key: { kind: 'ctrl', value: 'c' }, consumed: 1 });
	});

	it('parses arrow keys via CSI', () => {
		expect(parseKey('\x1b[A')).toMatchObject({ key: { kind: 'arrow', direction: 'up' } });
		expect(parseKey('\x1b[B')).toMatchObject({ key: { kind: 'arrow', direction: 'down' } });
		expect(parseKey('\x1b[C')).toMatchObject({ key: { kind: 'arrow', direction: 'right' } });
		expect(parseKey('\x1b[D')).toMatchObject({ key: { kind: 'arrow', direction: 'left' } });
	});

	it('parses home/end', () => {
		expect(parseKey('\x1b[H')).toMatchObject({ key: { kind: 'home' } });
		expect(parseKey('\x1b[F')).toMatchObject({ key: { kind: 'end' } });
	});

	it('returns null when waiting for more bytes', () => {
		expect(parseKey('\x1b')).toBeNull();
		expect(parseKey('\x1b[')).toBeNull();
	});

	it('treats lone escape as escape key', () => {
		expect(parseKey('\x1b\x1b')).toMatchObject({ key: { kind: 'escape' }, consumed: 2 });
	});
});

describe('parseKey extended', () => {
	it('parses function keys F1-F4 via application mode', () => {
		expect(parseKey('\x1bOP')!.key).toEqual({ kind: 'function', index: 1 });
		expect(parseKey('\x1bOQ')!.key).toEqual({ kind: 'function', index: 2 });
		expect(parseKey('\x1bOR')!.key).toEqual({ kind: 'function', index: 3 });
		expect(parseKey('\x1bOS')!.key).toEqual({ kind: 'function', index: 4 });
	});

	it('parses function keys F5-F12 via CSI tilde', () => {
		expect(parseKey('\x1b[15~')!.key).toEqual({ kind: 'function', index: 5 });
		expect(parseKey('\x1b[24~')!.key).toEqual({ kind: 'function', index: 12 });
	});

	it('parses ctrl+arrow modifier', () => {
		const key = parseKey('\x1b[1;5C')!.key;
		expect(key).toMatchObject({ kind: 'arrow', direction: 'right', ctrl: true });
	});

	it('parses shift+arrow modifier', () => {
		const key = parseKey('\x1b[1;2A')!.key;
		expect(key).toMatchObject({ kind: 'arrow', direction: 'up', shift: true });
	});

	it('parses alt+char combination', () => {
		expect(parseKey('\x1bx')!.key).toEqual({ kind: 'alt', value: 'x' });
		expect(parseKey('\x1bm')!.key).toEqual({ kind: 'alt', value: 'm' });
	});
});

describe('parseKey unicode', () => {
	it('parses CJK char as single char', () => {
		expect(parseKey('中')!.key).toEqual({ kind: 'char', value: '中' });
		expect(parseKey('文')!.key).toEqual({ kind: 'char', value: '文' });
	});

	it('parses emoji surrogate pair as one char', () => {
		const r = parseKey('😀')!;
		expect(r.key).toEqual({ kind: 'char', value: '😀' });
		expect(r.consumed).toBe(2);
	});

	it('parses CJK among ascii buffer', () => {
		const r = parseKey('a中b')!;
		expect(r.key).toEqual({ kind: 'char', value: 'a' });
	});
});
