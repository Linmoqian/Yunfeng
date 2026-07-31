// 契约一致性测试：前端 lib/types.ts 与 sidecar src/types.ts 是同一协议镜像，
// 同名接口的字段名与类型必须一致（防止改一侧忘改另一侧）。

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frontendTypes = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
const sidecarTypes = readFileSync(new URL("../../sidecar/src/types.ts", import.meta.url), "utf8");

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

const frontend = extractInterfaces(frontendTypes);
const sidecar = extractInterfaces(sidecarTypes);

describe("types 契约镜像", () => {
  const shared = [...frontend.keys()].filter((name) => sidecar.has(name));

  it("协议接口在两侧都存在", () => {
    expect(shared.length).toBeGreaterThan(0);
  });

  it("同名接口的字段名与类型一致", () => {
    const diffs: string[] = [];
    for (const name of shared) {
      const a = frontend.get(name)!.fields;
      const b = sidecar.get(name)!.fields;
      const allKeys = new Set([...a.keys(), ...b.keys()]);
      for (const key of allKeys) {
        if (a.get(key) !== b.get(key)) {
          diffs.push(`${name}.${key}: 前端(${a.get(key) ?? "缺失"}) vs sidecar(${b.get(key) ?? "缺失"})`);
        }
      }
    }
    expect(diffs).toEqual([]);
  });
});
