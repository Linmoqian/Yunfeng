import { describe, expect, it } from "vitest";
import { Messages } from "../src/components/messages.js";

describe("Messages", () => {
	it("renders role icon and from", () => {
		const m = new Messages();
		m.add({ role: "system", from: "yunfeng", content: "boot" });
		const rows = m.render(40);
		const header = rows[0] ?? "";
		// 去掉 ANSI 后应包含 "ℹ yunfeng"（icon 来自角色映射，而非消息字段）
		const plain = header.replace(/\x1b\[[0-9;]*m/g, "");
		expect(plain).toContain("ℹ yunfeng");
		expect(plain).not.toContain("undefined");
	});

	it("renders multiline content line by line", () => {
		const m = new Messages();
		m.add({ role: "assistant", from: "a", content: "line1\nline2" });
		const rows = m.render(40);
		const plain = rows.map((r) => r.replace(/\x1b\[[0-9;]*m/g, ""));
		expect(plain.some((r) => r.includes("line1"))).toBe(true);
		expect(plain.some((r) => r.includes("line2"))).toBe(true);
	});
});

describe("Messages scrolling", () => {
	function make(msgs: { role: "user" | "assistant" | "system"; from: string; content: string }[]) {
		const m = new Messages();
		for (const msg of msgs) m.add(msg);
		return m;
	}
	const three = [
		{ role: "user" as const, from: "u", content: "m1" },
		{ role: "user" as const, from: "u", content: "m2" },
		{ role: "user" as const, from: "u", content: "m3" },
	];

	it("renders all rows without height", () => {
		const m = make(three);
		const rows = m.render(40);
		expect(rows.length).toBe(6); // 3 条 × (header + content)
	});

	it("renders only viewport rows from bottom (sticky bottom)", () => {
		const m = make(three);
		const rows = m.render(40, 4);
		expect(rows.length).toBe(4);
		const text = rows.map((r) => r.replace(/\x1b\[[0-9;]*m/g, "")).join("\n");
		expect(text).toContain("m3");
		expect(text).not.toContain("m1");
	});

	it("scroll up reveals older messages", () => {
		const m = make(three);
		m.scrollBy(2);
		const rows = m.render(40, 4);
		const text = rows.map((r) => r.replace(/\x1b\[[0-9;]*m/g, "")).join("\n");
		expect(text).toContain("m1");
		expect(text).not.toContain("m3");
	});

	it("clamps scroll to maxScroll", () => {
		const m = make(three);
		m.setScroll(999);
		const rows = m.render(40, 4);
		expect(rows.length).toBe(4);
		expect(m.maxScroll).toBe(2); // 6 行 - 4 视口
	});

	it("add keeps bottom-sticky only when already at bottom", () => {
		const m = make(three);
		m.scrollBy(2); // 回看历史
		m.add({ role: "user", from: "u", content: "m4" });
		expect(m.scroll).toBe(2); // 保持位置，不强制跳回
		const bottom = new Messages();
		bottom.add({ role: "user", from: "u", content: "a" });
		bottom.add({ role: "user", from: "u", content: "b" });
		expect(bottom.scroll).toBe(0); // 贴底
	});

	it("handleInput scrolls when focused only", () => {
		const m = make(three);
		expect(m.handleInput("\x1b[A")).toBe(false); // 未聚焦不消费
		m.focused = true;
		expect(m.handleInput("\x1b[A")).toBe(true);
		expect(m.scroll).toBe(1);
		expect(m.handleInput("\x1b[B")).toBe(true);
		expect(m.scroll).toBe(0);
	});
});
