/* 分层依赖回归：业务仅认识直属边界，服务和传输不得反向依赖成员或界面。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// 公共契约是叶子；connect 是唯一允许同时装配服务与 HTTP 实现的入口。
const dependencies: Record<string, string[]> = {
  "types.ts": [],
  "members.ts": ["./TeamMember.ts", "./types.ts"],
  "robots.ts": ["./RobotMember.ts"],
  "RobotMember.ts": ["./TeamMember.ts", "./types.ts"],
  "TeamMember.ts": ["./types.ts"],
  "service.ts": ["./types.ts"],
  "http.ts": ["./types.ts"],
  "connect.ts": ["./http.ts", "./service.ts", "./types.ts"],
};
test("成员与基础设施仅依赖指定下层，公共契约没有反向依赖", async () => {
  for (const [file, allowed] of Object.entries(dependencies)) {
    const source = await readFile(new URL("../src/" + file, import.meta.url), "utf8");
    const imports = [...source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
    for (const dependency of imports) assert(allowed.includes(dependency), `${file} 不得依赖 ${dependency}`);
    assert(!/\bimport\s*\(/.test(source), `${file} 不得通过动态导入绕过分层`);
    assert(!/\brequire\s*\(/.test(source), `${file} 不得通过 require 绕过分层`);
  }
});
