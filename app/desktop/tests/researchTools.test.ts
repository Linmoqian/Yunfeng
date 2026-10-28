/* 四工具提纲、格式化与稳定引用的行为测试。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSelection, withCitations } from "../src/features/workbench/research-tools/documentEditing.ts";
import { RESEARCH_TOOLS, OUTLINES, isResearchTool } from "../src/features/workbench/research-tools/model.ts";
test("四个工具有独立提纲和可切换标识", () => {
  assert.equal(RESEARCH_TOOLS.length, 4);
  for (const tool of RESEARCH_TOOLS) { assert.ok(isResearchTool(tool.id)); assert.match(OUTLINES[tool.id], /^# /); }
  assert.ok(!isResearchTool("breeding"));
});
test("格式化只改变选区并支持取消粗体", () => {
  assert.deepEqual(formatSelection("中文正文", [2,4], "bold"), { content:"中文**正文**", selection:[4,6] });
  assert.deepEqual(formatSelection("中文**正文**", [4,6], "bold"), { content:"中文正文", selection:[2,4] });
  assert.equal(formatSelection("一\n二", [0,3], "list").content, "- 一\n- 二");
});
test("只补齐被引用文献的脚注且重复调用不增加重复脚注", () => {
  const references = [{id:"a", title:"证据", citation:"作者 2026", url:"https://example.org", notes:"记录"}, {id:"b",title:"无引用",citation:"",url:"",notes:""}];
  const body = withCitations("来源[^ref-a]", references);
  assert.match(body, /\[\^ref-a\]: 证据/); assert.ok(!body.includes("无引用")); assert.equal(withCitations(body, references), body);
});
