import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tokenCss = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8").toLowerCase();
const tokenSource = JSON.parse(
  readFileSync(new URL("../../docs/design/yunfeng-tokens.json", import.meta.url), "utf8"),
) as {
  color: Record<string, Record<string, { $value: { light: string; dark: string } }>>;
  radius: Record<string, { $value: string }>;
  shadow: Record<string, unknown>;
};

test("运行时主题与 Yunfeng 颜色和圆角 token 源保持一致", () => {
  for (const [group, tokens] of Object.entries(tokenSource.color)) {
    for (const [name, token] of Object.entries(tokens)) {
      const cssName = `--yf-${group}-${name}`;
      assert.match(tokenCss, new RegExp(`${cssName}:\\s*${token.$value.light.toLowerCase()}`));
      assert.match(tokenCss, new RegExp(`${cssName}:\\s*${token.$value.dark.toLowerCase()}`));
    }
  }

  for (const [name, token] of Object.entries(tokenSource.radius)) {
    const value = token.$value === "0px" ? "0" : token.$value;
    assert.match(tokenCss, new RegExp(`--yf-radius-${name}:\\s*${value}`));
  }
});

test("运行时主题声明完整阴影，并由兼容语义映射到 yf token", () => {
  for (const name of Object.keys(tokenSource.shadow)) {
    assert.ok(tokenCss.includes(`--yf-shadow-${name}:`));
  }

  assert.match(tokenCss, /--canvas:\s*var\(--yf-bg-canvas\)/);
  assert.match(tokenCss, /--accent:\s*var\(--yf-brand-primary\)/);
  assert.match(tokenCss, /--attention:\s*var\(--yf-semantic-error\)/);
  assert.match(tokenCss, /--positive:\s*var\(--yf-semantic-success\)/);
});
