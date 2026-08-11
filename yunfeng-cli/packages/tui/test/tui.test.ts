import { describe, expect, it } from "vitest";
import { TuiMainScreen } from "../src/tui-main-screen.js";
import type { Terminal } from "../src/tui.js";
import { VStack } from "../src/layout/v-stack.js";
import { Editor } from "../src/components/editor.js";
import { Messages } from "../src/components/messages.js";
import { StatusBar } from "../src/components/status.js";
import { stripTerminalSequences } from "../src/utils.js";

/** 内存假终端，便于在测试中驱动 TUI */
class FakeTerminal implements Terminal {
	output = "";
	cols = 40;
	rows = 12;
	inputHandler: ((d: string) => void) | null = null;
	resizeHandler: (() => void) | null = null;
	private started = false;

	start(onInput: (d: string) => void, onResize: () => void): void {
		this.inputHandler = onInput;
		this.resizeHandler = onResize;
		this.started = true;
	}
	stop(): void {
		this.started = false;
	}
	write(data: string): void {
		this.output += data;
	}
	get columns(): number {
		return this.cols;
	}
	get rows(): number {
		return this.rows;
	}
	hideCursor(): void {
		this.output += "\x1b[?25l";
	}
	showCursor(): void {
		this.output += "\x1b[?25h";
	}
	clearScreen(): void {
		this.output += "\x1b[2J\x1b[H";
	}

	emit(data: string): void {
		this.inputHandler?.(data);
	}
	resize(cols: number, rows: number): void {
		this.cols = cols;
		this.rows = rows;
		this.resizeHandler?.();
	}
}

function buildFresh() {
	const term = new FakeTerminal();
	const messages = new Messages([
		{ role: "system", from: "yunfeng", content: "boot" },
	]);
	const editor = new Editor("");
	const status = new StatusBar(() => ({ cwd: "/proj", sessionName: "t" }));
	const tui = new TuiMainScreen({ terminal: term });
	const layout = new VStack([
		{ component: messages, grow: 1 },
		{ component: editor },
		{ component: status },
	]);
	tui.addChild(layout);
	tui.setFocus(editor);
	return { term, tui, messages, editor };
}

describe("TuiMainScreen", () => {
	it("start renders initial frame with message text", () => {
		const { tui, term } = buildFresh();
		tui.start();
		tui.renderNow(true);
		const plain = stripTerminalSequences(term.output);
		expect(plain).toContain("boot");
		expect(plain).toContain("yunfeng");
	});

	it("editor input updates rendered output", () => {
		const { tui, term, editor } = buildFresh();
		tui.start();
		tui.renderNow(true);
		const before = term.output;
		term.emit("hello");
		tui.renderNow(true);
		const after = stripTerminalSequences(term.output);
		expect(editor.value).toBe("hello");
		expect(after).toContain("hello");
		expect(after.length).toBeGreaterThan(stripTerminalSequences(before).length);
	});

	it("resolution of grow leaves editor/status rows present", () => {
		const { tui, term } = buildFresh();
		tui.start();
		tui.renderNow(true);
		const lines = stripTerminalSequences(term.output).split("\n");
		expect(lines.length).toBeGreaterThanOrEqual(2);
	});
});

describe("TuiMainScreen diff rendering", () => {
	it("no change on second render outputs nothing", () => {
		const { tui, term } = buildFresh();
		tui.start();
		tui.renderNow(true);
		term.output = "";
		tui.renderNow(true);
		// 无内容变化时不发任何重绘序列（允许光标状态管理序列）
		expect(term.output).not.toContain("\x1b[2K");
		expect(term.output).not.toContain("\x1b[H");
	});

	it("single-line change redraws only changed rows", () => {
		const { tui, term, editor } = buildFresh();
		tui.start();
		tui.renderNow(true);
		const fullOutput = term.output;
		term.output = "";
		term.emit("x");
		tui.renderNow(true);
		const delta = term.output;
		expect(delta).not.toContain("\x1b[H"); // 非全量重绘
		expect(delta).toContain("H\x1b[2K"); // 定位 + 清行
		expect(delta.length).toBeLessThan(fullOutput.length);
		expect(stripTerminalSequences(delta)).toContain("x");
	});

	it("resize forces full redraw", () => {
		const { tui, term } = buildFresh();
		tui.start();
		tui.renderNow(true);
		term.output = "";
		term.resize(50, 14);
		tui.renderNow(true);
		expect(term.output).toContain("\x1b[H");
	});

	it("row removal clears leftover lines", () => {
		const { tui, term, messages } = buildFresh();
		tui.start();
		tui.renderNow(true);
		// 追加一条消息，再移除（行数减少）应触发清行
		messages.add({ role: "user", from: "you", content: "hello" });
		tui.renderNow(true);
		term.output = "";
		messages.items = messages.items.slice(0, 1);
		messages.add({ role: "system", from: "yunfeng", content: "boot" });
		tui.renderNow(true);
		// 行数变化时旧的更长内容应被清掉（输出包含清行序列）
		expect(term.output).toContain("\x1b[2K");
	});
});

describe("global shortcuts", () => {
	it("handler consuming a key prevents editor from handling it", () => {
		const { tui, term, editor } = buildFresh();
		tui.start();
		tui.renderNow(true);
		let fired = 0;
		tui.addGlobalShortcut("test", (key) => {
			if (key.kind === "ctrl" && key.value === "c") {
				fired++;
				return true;
			}
			return false;
		});
		term.emit("\x03");
		tui.renderNow(true);
		expect(fired).toBe(1);
		expect(editor.value).toBe(""); // ctrl-c 未进入编辑器
	});

	it("non-consuming handler lets input through to component", () => {
		const { tui, term, editor } = buildFresh();
		tui.start();
		tui.renderNow(true);
		tui.addGlobalShortcut("pass", () => false);
		term.emit("h");
		tui.renderNow(true);
		expect(editor.value).toBe("h");
	});

	it("unsub removes shortcut", () => {
		const { tui, term } = buildFresh();
		tui.start();
		let fired = 0;
		const unsub = tui.addGlobalShortcut("x", () => {
			fired++;
			return false;
		});
		unsub();
		term.emit("\x03");
		expect(fired).toBe(0);
	});
});
