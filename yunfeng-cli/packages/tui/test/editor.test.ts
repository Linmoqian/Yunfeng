import { describe, expect, it } from "vitest";
import { Editor } from "../src/components/editor.js";

function keys(editor: Editor, seq: string[]): void {
	for (const k of seq) {
		editor.handleInput(k);
	}
}

describe("Editor", () => {
	it("inserts chars at cursor", () => {
		const e = new Editor("");
		e.handleInput("h");
		e.handleInput("i");
		expect(e.value).toBe("hi");
		expect(e.cursor).toBe(2);
	});

	it("backspace removes left of cursor", () => {
		const e = new Editor("");
		keys(e, ["a", "b", "\x7f"]);
		expect(e.value).toBe("a");
		expect(e.cursor).toBe(1);
	});

	it("backspace at start does nothing", () => {
		const e = new Editor("");
		e.handleInput("\x7f");
		expect(e.value).toBe("");
	});

	it("arrow left/right moves cursor", () => {
		const e = new Editor("abc");
		keys(e, ["\x1b[D", "\x1b[D"]);
		expect(e.cursor).toBe(1);
		e.handleInput("X");
		expect(e.value).toBe("aXbc");
	});

	it("enter inserts newline, multi-line cursor tracking", () => {
		const e = new Editor("");
		keys(e, ["a", "\n", "b"]);
		expect(e.value).toBe("a\nb");
		expect(e.currentLine).toBe(1);
	});
});

describe("Editor extra keys", () => {
	it("home moves to line start, end to line end", () => {
		const e = new Editor("ab\ncd");
		e.handleInput("\x1b[H"); // home
		expect(e.cursor).toBe(3);
		e.handleInput("\x1b[F"); // end
		expect(e.cursor).toBe(5);
	});

	it("delete removes char at cursor", () => {
		const e = new Editor("abc");
		keys(e, ["\x1b[D", "\x1b[D", "\x1b[3~"]);
		expect(e.value).toBe("ac");
		expect(e.cursor).toBe(1);
	});

	it("delete at end does nothing", () => {
		const e = new Editor("ab");
		e.handleInput("\x1b[3~");
		expect(e.value).toBe("ab");
	});
});

describe("Editor grapheme safety", () => {
	it("left/right move over surrogate pair as one grapheme", () => {
		const e = new Editor("a😀b");
		// 从末尾向左移动两次：应停在 😀 前（跳过 b 和 😀 整体）
		keys(e, ["\x1b[D", "\x1b[D"]);
		expect(e.cursor).toBe(1); // "a" 后
		e.handleInput("X");
		expect(e.value).toBe("aX😀b");
	});

	it("backspace removes full grapheme", () => {
		const e = new Editor("a😀");
		e.handleInput("\x7f");
		expect(e.value).toBe("a");
	});

	it("renders grapheme-aware cursor highlight", () => {
		const e = new Editor("😀x");
		e.handleInput("\x1b[D"); // 移到 x 前（字素边界）
		e.focused = true;
		const rows = e.render(40);
		const line = rows[0] ?? "";
		// 光标在完整 emoji 之后：剥离 ANSI 应含完整 emoji，且有高亮目标字符
		expect(line).toContain("😀");
		expect(line).toContain("\x1b[7m");
	});
});
