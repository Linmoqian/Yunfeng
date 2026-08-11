import { describe, expect, it } from "vitest";
import { style, clearLine, RESET } from "../src/terminal/ansi.js";
import { visibleWidth } from "../src/utils.js";

describe("ansi", () => {
	it("style wraps color and bold", () => {
		expect(style("hi", { bold: true, fg: "red" })).toBe(
			`\x1b[1;31mhi${RESET}`,
		);
	});

	it("style returns raw when empty", () => {
		expect(style("hi", {})).toBe("hi");
	});

	it("visibleWidth strips escape sequences", () => {
		const s = `${style("a", { fg: "#ff0000" })}${clearLine()}`;
		expect(visibleWidth(s)).toBe(1);
	});
});
