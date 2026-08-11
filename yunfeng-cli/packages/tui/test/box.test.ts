import { describe, expect, it } from "vitest";
import { Box } from "../src/layout/box.js";
import { Text } from "../src/layout/text.js";
import { stripTerminalSequences } from "../src/utils.js";

describe("Box", () => {
	it("adds padding around content", () => {
		const box = new Box(2, 1);
		box.addChild(new Text("hi"));
		const rows = box.render(10);
		expect(rows.length).toBe(3); // 上 padding + 内容 + 下 padding
		expect(rows[0]).toBe("");
		expect(stripTerminalSequences(rows[1]!)).toBe("  hi  ");
		expect(rows[2]).toBe("");
	});

	it("applies background to padded lines", () => {
		const box = new Box(1, 0, (line) => `\x1b[48;2;1;2;3m${line}\x1b[0m`);
		box.addChild(new Text("x"));
		const rows = box.render(5);
		expect(rows[0]).toContain("48;2;1;2;3");
		// Box 背景只覆盖内容行 + 内边距，不铺满到屏宽
		expect(stripTerminalSequences(rows[0]!)).toBe(" x ");
	});
});
