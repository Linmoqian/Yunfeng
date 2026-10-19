/* 保证 DOM 与终端读取同一份明暗语义，并且纯主题入口不加载 UI 依赖。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { palettes } from "../index.mjs";
import source from "../tokens.json" with { type: "json" };

test("明暗 CSS 与设计源一致，终端语义来自相同品牌与验收状态", () => {
  const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8").toLowerCase();
  for (const [group, values] of Object.entries(source.color)) {
    for (const [name, token] of Object.entries(values)) {
      for (const mode of ["light", "dark"]) {
        assert.ok(css.includes(`--yf-${group}-${name}: ${token.$value[mode].toLowerCase()}`));
      }
    }
  }
  for (const mode of ["light", "dark"]) {
    assert.equal(palettes[mode].brand, source.color.brand.primary.$value[mode].toLowerCase());
    assert.equal(palettes[mode].success, source.color.semantic.success.$value[mode].toLowerCase());
    assert.ok(Object.isFrozen(palettes[mode]));
  }
});
