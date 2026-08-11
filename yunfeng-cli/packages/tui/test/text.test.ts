import { describe, expect, it } from "vitest";
import { Text } from "../src/layout/text.js";
import { stripTerminalSequences } from "../src/utils.js";

describe("Text", () => {
	it("wraps long text by width", () => {
		const t = new Text("hello world foo bar");
		const rows = t.render(8);
		expect(rows.length).toBeGreaterThan(1);
		for (const row of rows) {
			expect(stripTerminalSequences(row).length).toBeLessThanOrEqual(8);
		}
	});

	it("setText updates rendered content", () => {
		const t = new Text("a");
		t.setText("b");
		expect(stripTerminalSequences(t.render(10).join(""))).toContain("b");
	});

	it("applies background fill to full width", () => {
		const t = new Text("hi", (line) => `\x1b[48;2;9;9;9m${line}\x1b[0m`);
		const rows = t.render(6);
		expect(stripTerminalSequences(rows[0]!)).toBe("hi    ");
	});
});
