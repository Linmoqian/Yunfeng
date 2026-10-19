import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tokenCss = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8").toLowerCase();
const tokenSource = JSON.parse(
  readFileSync(new URL("../../../docs/design/yunfeng-tokens.json", import.meta.url), "utf8"),
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

test("淡紫强调色与主按钮文字在明暗主题均保持可读对比度", () => {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255);
    const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const contrast = (first: string, second: string) => {
    const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  };
  for (const mode of ["light", "dark"] as const) {
    const primary = tokenSource.color.brand.primary.$value[mode];
    const hover = tokenSource.color.brand.hover.$value[mode];
    const label = tokenSource.color.brand["on-primary"].$value[mode];
    const surface = tokenSource.color.bg.surface.$value[mode];
    assert.ok(contrast(primary, label) >= 4.5, `${mode} 按钮文字`);
    assert.ok(contrast(hover, label) >= 4.5, `${mode} 悬停按钮文字`);
    assert.ok(contrast(primary, surface) >= 4.5, `${mode} 强调文字`);
  }
});
