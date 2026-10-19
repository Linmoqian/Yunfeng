/* 论文提纲与 Markdown 文件边界；容量与 Rust 共享文稿契约一致。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
export const PAPER_TEMPLATE = "# 论文标题\n\n## 摘要\n\n## 引言\n\n## 材料与方法\n\n## 结果\n\n## 讨论\n\n## 结论\n\n## 参考文献\n";
export const MAX_PAPER_BYTES = 64 * 1024;
export interface PaperHeading { title: string; level: number; line: number }

/** 只提取代码围栏以外的 ATX 标题；重复标题保留独立行号。 */
export function paperOutline(body: string): PaperHeading[] {
  const headings: PaperHeading[] = [];
  let fence: { character: string; length: number } | null = null;
  body.split(/\r?\n/).forEach((line, index) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return;
    }
    if (fence) return;
    const match = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/);
    if (match) {
      const title = match[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
      if (title) headings.push({ title, level: match[1].length, line: index });
    }
  });
  return headings;
}
export function paperByteLength(body: string): number { return new TextEncoder().encode(body).length; }
/** 导入只接受 UTF-8 Markdown，失败时调用方保留当前草稿。 */
export function decodePaperFile(name: string, bytes: ArrayBuffer): { name: string; body: string } {
  if (!/\.(md|markdown)$/i.test(name)) throw new Error("请选择 .md 或 .markdown 文件");
  if (bytes.byteLength > MAX_PAPER_BYTES) throw new Error("文稿不能超过 64 KiB");
  const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (body.includes("\0")) throw new Error("文稿包含非文本内容");
  return { name: Array.from(name.replace(/\.(md|markdown)$/i, "")).slice(0, 200).join(""), body };
}
export function paperFilename(name: string): string {
  return `${(name.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, "_") || "论文文稿").slice(0, 100)}.md`;
}
