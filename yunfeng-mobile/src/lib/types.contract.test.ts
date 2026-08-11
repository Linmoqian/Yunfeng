// 契约一致性测试：移动端 types.ts 与 app/src/lib/types.ts 是同一协议镜像，
// 同名接口的字段名与类型必须一致（防止移动端与桌面端协议漂移）。

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileTypes = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
const appTypes = readFileSync(new URL("../../../app/src/lib/types.ts", import.meta.url), "utf8");

interface InterfaceShape {
  fields: Map<string, string>;
}

function extractInterfaces(source: string): Map<string, InterfaceShape> {
  const result = new Map<string, InterfaceShape>();
  const interfaceRe = /export interface (\w+) \{([\s\S]*?)\n\}/g;
  for (const match of source.matchAll(interfaceRe)) {
    const [, name, body] = match;
    const fields = new Map<string, string>();
    const fieldRe = /^\s*(\w+)(\??):\s*([^;\n]+);/gm;
    for (const f of body.matchAll(fieldRe)) {
      const [, fieldName, optional, rawType] = f;
      fields.set(fieldName, `${optional}${normalizeType(rawType)}`);
    }
    result.set(name, { fields });
  }
  return result;
}

function normalizeType(t: string): string {
  return t.trim().replace(/\s+/g, " ");
}

const mobile = extractInterfaces(mobileTypes);
const app = extractInterfaces(appTypes);

describe("移动端 types 与 app 契约镜像", () => {
  const shared = [...mobile.keys()].filter((name) => app.has(name));

  it("协议接口在两侧都存在", () => {
    expect(shared.length).toBeGreaterThan(0);
  });

  it("同名接口的字段名与类型一致", () => {
    const diffs: string[] = [];
    for (const name of shared) {
      const a = mobile.get(name)!.fields;
      const b = app.get(name)!.fields;
      const allKeys = new Set([...a.keys(), ...b.keys()]);
      for (const key of allKeys) {
        if (a.get(key) !== b.get(key)) {
          diffs.push(
            `${name}.${key}: 移动端(${a.get(key) ?? "缺失"}) vs app(${b.get(key) ?? "缺失"})`,
          );
        }
      }
    }
    expect(diffs).toEqual([]);
  });
});
