import assert from "node:assert/strict";
import test from "node:test";
import { closeWorkspaceTabs, reorderWorkspaceTabs, EMPTY_TABS, visibleWorkspaceTabs, type WorkspaceTab } from "../src/features/workbench/workspaceTabsState.ts";

const items: WorkspaceTab[] = ["a", "b", "c"].map((id) => ({ id, title: id, kind: "draft" }));
test("标签键盘顺序跟随实际分组渲染并跳过折叠成员", () => {
  const grouped = items.map((item) => item.id !== "b" ? { ...item, group: "group" } : item);
  assert.deepEqual(visibleWorkspaceTabs(grouped, []).map((item) => item.id), ["a", "c", "b"]);
  assert.deepEqual(visibleWorkspaceTabs(grouped, ["group"]).map((item) => item.id), ["b"]);
});
test("批量关闭其他标签保留当前标签与全部恢复记录", () => {
  const result = closeWorkspaceTabs({ ...EMPTY_TABS, items, active: "b" }, ["a", "c"]);
  assert.deepEqual(result.items.map((item) => item.id), ["b"]);
  assert.deepEqual(result.closed.map((item) => item.id), ["a", "c"]);
  assert.equal(result.active, "b");
});
test("关闭当前标签选择右邻居，并展开其分组", () => {
  const grouped = items.map((item) => item.id === "c" ? { ...item, group: "group" } : item);
  const result = closeWorkspaceTabs({ ...EMPTY_TABS, items: grouped, active: "b", collapsedGroups: ["group"] }, ["b"]);
  assert.equal(result.active, "c");
  assert.deepEqual(result.collapsedGroups, []);
  assert.equal(grouped.length, 3);
});
test("关闭所有标签回到欢迎页，恢复记录有界", () => {
  const result = closeWorkspaceTabs({ ...EMPTY_TABS, items, active: "a", closed: Array(20).fill(items[0]) }, ["a", "b", "c"]);
  assert.equal(result.active, "home");
  assert.equal(result.items.length, 0);
  assert.equal(result.closed.length, 20);
});

test("拖动支持在目标前后插入并保留激活状态", () => {
  const state = { ...EMPTY_TABS, items, active: "a" };
  const after = reorderWorkspaceTabs(state, "a", "c", true);
  assert.deepEqual(after.items.map((item) => item.id), ["b", "c", "a"]);
  assert.equal(after.active, "a");
  assert.deepEqual(reorderWorkspaceTabs(after, "a", "b", false).items.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(reorderWorkspaceTabs(state, "a", "a", false), state);
  assert.equal(reorderWorkspaceTabs(state, "missing", "a", false), state);
});
