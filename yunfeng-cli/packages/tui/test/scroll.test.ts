import { describe, expect, it } from "vitest";
import { Scroll } from "../src/layout/scroll.js";
import type { Component } from "../src/tui.js";

class Fixed implements Component {
  constructor(private lines: string[]) {}
  invalidate(): void {}
  render(): string[] {
    return this.lines;
  }
}

const lines20 = Array.from({ length: 20 }, (_, i) => `line${i}`);

describe("Scroll", () => {
	it("returns all rows without height", () => {
		const s = new Scroll(new Fixed(lines20));
		expect(s.render(40).length).toBe(20);
	});

	it("clips to viewport and sticks to bottom by default", () => {
		const s = new Scroll(new Fixed(lines20));
		const rows = s.render(40, 5);
		expect(rows).toEqual(["line15", "line16", "line17", "line18", "line19"]);
		expect(s.maxScroll).toBe(15);
	});

	it("scrollBy reveals older content", () => {
		const s = new Scroll(new Fixed(lines20));
		s.scrollBy(5);
		const rows = s.render(40, 5);
		expect(rows[0]).toBe("line10");
	});

	it("clamps scroll to maxScroll", () => {
		const s = new Scroll(new Fixed(lines20));
		s.setScroll(999);
		const rows = s.render(40, 5);
		expect(rows[0]).toBe("line0");
	});

	it("handleInput scrolls with arrows and pages when focused", () => {
		const s = new Scroll(new Fixed(lines20));
		expect(s.handleInput("\x1b[A")).toBe(false); // 未聚焦
		s.focused = true;
		expect(s.handleInput("\x1b[A")).toBe(true);
		expect(s.scroll).toBe(1);
		expect(s.handleInput("\x1b[5~")).toBe(true); // PgUp
		expect(s.scroll).toBe(11);
		expect(s.handleInput("\x1b[6~")).toBe(true); // PgDn
		expect(s.scroll).toBe(1);
	});
});
