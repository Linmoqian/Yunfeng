import { describe, expect, it } from 'vitest';
import { Editor } from '../src/components/editor.js';

function keys(editor: Editor, seq: string[]): void {
	for (const k of seq) {
		editor.handleInput(k);
	}
}

describe('Editor', () => {
	it('inserts chars at cursor', () => {
		const e = new Editor('');
		e.handleInput('h');
		e.handleInput('i');
		expect(e.value).toBe('hi');
		expect(e.cursor).toBe(2);
	});

	it('backspace removes left of cursor', () => {
		const e = new Editor('');
		keys(e, ['a', 'b', '\x7f']);
		expect(e.value).toBe('a');
		expect(e.cursor).toBe(1);
	});

	it('backspace at start does nothing', () => {
		const e = new Editor('');
		e.handleInput('\x7f');
		expect(e.value).toBe('');
	});

	it('arrow left/right moves cursor', () => {
		const e = new Editor('abc');
		keys(e, ['\x1b[D', '\x1b[D']);
		expect(e.cursor).toBe(1);
		e.handleInput('X');
		expect(e.value).toBe('aXbc');
	});

	it('enter inserts newline, multi-line cursor tracking', () => {
		const e = new Editor('');
		keys(e, ['a', '\n', 'b']);
		expect(e.value).toBe('a\nb');
		expect(e.currentLine).toBe(1);
	});
});

describe('Editor extra keys', () => {
	it('home moves to line start, end to line end', () => {
		const e = new Editor('ab\ncd');
		e.handleInput('\x1b[H'); // home
		expect(e.cursor).toBe(3);
		e.handleInput('\x1b[F'); // end
		expect(e.cursor).toBe(5);
	});

	it('delete removes char at cursor', () => {
		const e = new Editor('abc');
		keys(e, ['\x1b[D', '\x1b[D', '\x1b[3~']);
		expect(e.value).toBe('ac');
		expect(e.cursor).toBe(1);
	});

	it('delete at end does nothing', () => {
		const e = new Editor('ab');
		e.handleInput('\x1b[3~');
		expect(e.value).toBe('ab');
	});
});

describe('Editor grapheme safety', () => {
	it('left/right move over surrogate pair as one grapheme', () => {
		const e = new Editor('a😀b');
		// 从末尾向左移动两次：应停在 😀 前（跳过 b 和 😀 整体）
		keys(e, ['\x1b[D', '\x1b[D']);
		expect(e.cursor).toBe(1); // "a" 后
		e.handleInput('X');
		expect(e.value).toBe('aX😀b');
	});

	it('backspace removes full grapheme', () => {
		const e = new Editor('a😀');
		e.handleInput('\x7f');
		expect(e.value).toBe('a');
	});

	it('renders grapheme-aware cursor highlight', () => {
		const e = new Editor('😀x');
		e.handleInput('\x1b[D'); // 移到 x 前（字素边界）
		e.focused = true;
		const rows = e.render(40);
		const line = rows[0] ?? '';
		// 光标在完整 emoji 之后：剥离 ANSI 应含完整 emoji，且有高亮目标字符
		expect(line).toContain('😀');
		expect(line).toContain('\x1b[7m');
	});
});

describe('Editor CJK input', () => {
	it('inserts CJK chars at cursor', () => {
		const e = new Editor('');
		keys(e, ['你', '好']);
		expect(e.value).toBe('你好');
		expect(e.cursor).toBe(2);
	});

	it('backspace removes full CJK char', () => {
		const e = new Editor('你好');
		e.handleInput('\x7f');
		expect(e.value).toBe('你');
		expect(e.cursor).toBe(1);
	});

	it('left arrow moves over CJK char as one unit', () => {
		const e = new Editor('你x');
		e.handleInput('\x1b[D'); // 移到 x 前
		e.handleInput('\x1b[D'); // 移到 你 前
		expect(e.cursor).toBe(0);
	});

	it('currentLineCol counts code units correctly for cursor marker', () => {
		const e = new Editor('你好x');
		e.handleInput('\x1b[D'); // x 前
		expect(e.currentLineCol).toBe(2); // 两个 code unit
	});
});

describe('Editor undo/redo', () => {
	it('undo reverts grouped char insert, redo restores', () => {
		const e = new Editor('');
		keys(e, ['a', 'b', 'c']);
		expect(e.value).toBe('abc');
		// Ctrl+Z（0x1a）撤销整组连续输入
		e.handleInput('\x1a');
		expect(e.value).toBe('');
		// Ctrl+Y（0x19）重做
		e.handleInput('\x19');
		expect(e.value).toBe('abc');
	});

	it('separate edit groups are separate undo steps', () => {
		const e = new Editor('');
		keys(e, ['a', '\x1b[D', 'b']); // 输入 a，左移（重置分组），输入 b
		expect(e.value).toBe('ba');
		e.handleInput('\x1a');
		expect(e.value).toBe('a');
		e.handleInput('\x1a');
		expect(e.value).toBe('');
	});

	it('backspace group undoes deletion', () => {
		const e = new Editor('hello');
		keys(e, ['\x7f', '\x7f']); // 删两个（一组）
		expect(e.value).toBe('hel');
		e.handleInput('\x1a');
		expect(e.value).toBe('hello');
	});
});

describe('Editor word navigation', () => {
	it('ctrl+left jumps to previous word start', () => {
		const e = new Editor('hello world');
		e.handleInput('\x1b[1;5D'); // Ctrl+Left
		expect(e.cursor).toBe(6); // "world" 前
		e.handleInput('\x1b[1;5D');
		expect(e.cursor).toBe(0);
	});

	it('ctrl+right jumps to next word start', () => {
		const e = new Editor('hello world');
		e.cursor = 0; // 从行首开始
		e.handleInput('\x1b[1;5C'); // Ctrl+Right
		expect(e.cursor).toBe(6); // "world" 词首
		e.handleInput('\x1b[1;5C');
		expect(e.cursor).toBe(11); // 文末
	});

	it('CJK text treats punctuation as boundary', () => {
		const e = new Editor('你好，世界');
		e.handleInput('\x1b[1;5D'); // Ctrl+Left：跳过 世界 到逗号后
		expect(e.cursor).toBe(3); // "你好，" 后
	});
});

describe('Editor submit mode', () => {
	it('submitOnEnter fires onSubmit with text and clears editor', () => {
		const e = new Editor('', { submitOnEnter: true });
		let submitted = '';
		e.onSubmit = (text) => (submitted = text);
		keys(e, ['你', '好']);
		e.handleInput('\r');
		expect(submitted).toBe('你好');
		expect(e.value).toBe('');
		expect(e.cursor).toBe(0);
	});

	it('submitOnEnter ignores empty submit', () => {
		const e = new Editor('', { submitOnEnter: true });
		let count = 0;
		e.onSubmit = () => count++;
		e.handleInput('\r');
		expect(count).toBe(0);
	});

	it('default mode keeps newline insertion on enter', () => {
		const e = new Editor('');
		e.handleInput('a');
		e.handleInput('\r');
		expect(e.value).toBe('a\n');
	});
});

describe('Editor theme', () => {
	it('applies custom prompt and text colors', () => {
		const e = new Editor('hi', {
			theme: {
				prompt: (t) => `\x1b[31m${t}\x1b[0m`,
				text: (t) => `\x1b[34m${t}\x1b[0m`,
			},
		});
		e.focused = true;
		const rows = e.render(40);
		expect(rows[0]).toContain('\x1b[31m'); // prompt 红
		expect(rows[0]).toContain('\x1b[34m'); // 文本蓝
	});
});
