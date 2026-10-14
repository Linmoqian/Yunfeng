/* 论文标题提取与 UTF-8 导入边界测试。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodePaperFile, MAX_PAPER_BYTES, PAPER_TEMPLATE, paperByteLength, paperFilename, paperOutline } from "../src/features/workbench/paperWriting.ts";
function buffer(text: string): ArrayBuffer { return new TextEncoder().encode(text).buffer; }
test("论文提纲保留层级和重复标题并跳过代码围栏", () => {
  const outline = paperOutline("# 标题\n## 方法 ##\n```md\n# 示例\n```\n~~~\n## 示例\n~~~\n## 方法");
  assert.deepEqual(outline, [{ title: "标题", level: 1, line: 0 }, { title: "方法", level: 2, line: 1 }, { title: "方法", level: 2, line: 8 }]);
  assert.equal(paperOutline(PAPER_TEMPLATE).length, 8);
});
test("Markdown 导入接受中文和 BOM，限制 UTF-8 字节而非字符数", () => {
  assert.deepEqual(decodePaperFile("研究.MD", buffer("\ufeff# 摘要")), { name: "研究", body: "# 摘要" });
  assert.equal(paperByteLength("云枫"), 6);
  assert.doesNotThrow(() => decodePaperFile("draft.md", buffer("a".repeat(MAX_PAPER_BYTES))));
  assert.throws(() => decodePaperFile("draft.md", buffer("云".repeat(22000))), /64 KiB/);
});
test("非法扩展名、编码与二进制内容不进入文稿", () => {
  assert.throws(() => decodePaperFile("paper.pdf", buffer("text")), /请选择/);
  assert.throws(() => decodePaperFile("paper.md", new Uint8Array([255]).buffer));
  assert.throws(() => decodePaperFile("paper.md", buffer("a\0b")), /非文本/);
  assert.equal(paperFilename("a/b:c"), "a_b_c.md");
  assert.equal(paperFilename(" "), "论文文稿.md");
});
