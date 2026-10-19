import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_LAYOUT, fitWorkspaceLayout, normalizePanelWidth, snapPanelWidth } from "../src/features/workbench/workspaceLayout.ts";

test("分栏宽度越界与非有限值回落，窄栏吸附为图标模式", () => {
  assert.equal(normalizePanelWidth("navigation", Infinity), 248);
  assert.equal(normalizePanelWidth("workbench", 900), 480);
  assert.equal(snapPanelWidth("navigation", -10), 64);
  assert.equal(snapPanelWidth("navigation", 160), 64);
  assert.equal(snapPanelWidth("navigation", 161), 161);
});
test("小窗口优先压缩导航，保留中心并且不覆盖保存宽度", () => {
  const preferred = { ...DEFAULT_LAYOUT };
  const narrow = fitWorkspaceLayout(preferred, 800);
  assert.equal(narrow.navigation, 64);
  assert.equal(narrow.workbench, 232);
  assert.equal(preferred.navigation, 248);
  assert.equal(preferred.workbench, 320);
  assert.deepEqual(fitWorkspaceLayout(preferred, 1280), preferred);
});
test("关闭一栏后释放宽度，移动窗口使用抽屉尺寸", () => {
  assert.equal(fitWorkspaceLayout({ ...DEFAULT_LAYOUT, workbenchOpen: false }, 800).navigation, 248);
  assert.deepEqual(fitWorkspaceLayout(DEFAULT_LAYOUT, 640), DEFAULT_LAYOUT);
});
