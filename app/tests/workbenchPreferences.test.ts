import assert from "node:assert/strict";
import test from "node:test";

import { resolveSidebarCollapsed } from "../src/features/workbench/workbenchPreferences.ts";

test("resolveSidebarCollapsed 首次使用时默认收起任务列表", () => {
  assert.equal(resolveSidebarCollapsed(null), true);
});

test("resolveSidebarCollapsed 保留用户明确选择的侧栏状态", () => {
  assert.equal(resolveSidebarCollapsed("false"), false);
  assert.equal(resolveSidebarCollapsed("true"), true);
});
