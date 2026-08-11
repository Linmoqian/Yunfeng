import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mascot } from "../src/components/mascot.js";
import { stripTerminalSequences } from "../src/utils.js";

const plain = (rows: string[]) => rows.map((r) => stripTerminalSequences(r));

describe("Mascot", () => {
	it("renders a cloud of 7 lines without leading float", () => {
		const m = new Mascot();
		const rows = m.render(40);
		expect(rows.length).toBe(7);
		expect(rows[0]).not.toBe("");
	});

	it("cloud contains body, eyes and mouth characters", () => {
		const m = new Mascot();
		const text = plain(m.render(40)).join("");
		expect(text).toContain("█");
		expect(text).toContain("●");
		expect(text).toContain("▁");
	});

	it("colors cloud characters with ANSI sequences", () => {
		const m = new Mascot();
		const rows = m.render(40);
		expect(rows.some((r) => r.includes("\x1b[") && r.includes("m"))).toBe(true);
	});

	it("odd frame floats one leading blank line", () => {
		const m = new Mascot();
		m.setFrame(1);
		const rows = m.render(40);
		expect(rows.length).toBe(8);
		expect(rows[0]).toBe("");
		expect(plain(rows.slice(1)).join("")).toContain("█");
	});

	it("tick advances frame", () => {
		const m = new Mascot();
		expect(m.frame).toBe(0);
		m.tick();
		expect(m.frame).toBe(1);
	});

	it("centers cloud when width is larger", () => {
		const m = new Mascot();
		const rows = m.render(40);
		const first = plain(rows)[0] ?? "";
		// 19 列云朵在 40 列宽下应左侧缩进（缩进约 (40-19)/2）
		expect(first.indexOf("▄")).toBeGreaterThan(0);
	});

	describe("built-in animation", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it("calls onFrame on interval and advances frame", () => {
			const onFrame = vi.fn();
			const m = new Mascot({ animate: true, intervalMs: 500, onFrame });
			expect(onFrame).not.toHaveBeenCalled();
			vi.advanceTimersByTime(500);
			expect(m.frame).toBe(1);
			expect(onFrame).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(500);
			expect(m.frame).toBe(2);
			expect(onFrame).toHaveBeenCalledTimes(2);
			m.stop();
		});

		it("stop clears the timer", () => {
			const onFrame = vi.fn();
			const m = new Mascot({ animate: true, intervalMs: 500, onFrame });
			m.stop();
			vi.advanceTimersByTime(2000);
			expect(onFrame).not.toHaveBeenCalled();
		});
	});
});

describe("dispose", () => {
	it("dispose stops the animation timer", () => {
		vi.useFakeTimers();
		const onFrame = vi.fn();
		const m = new Mascot({ animate: true, intervalMs: 500, onFrame });
		m.dispose();
		vi.advanceTimersByTime(2000);
		expect(onFrame).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
