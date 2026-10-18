/* 读取与精确修改入口，桌面由 Rust 执行；独立 Server 复用既有文件实现。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { nativeResearchFiles, type TextSlice } from "./native-files.js";
import { readProjectText } from "./project.js";
export { patchExecutionFile as modifyText } from "./execution-files.js";
export async function readText(cwd: string, path: string, start_line = 1, line_count = 200): Promise<TextSlice> {
  if (!Number.isSafeInteger(start_line) || start_line < 1 || start_line > 65537 || !Number.isSafeInteger(line_count) || line_count < 1 || line_count > 1000) throw new Error("读取行范围无效");
  const native = nativeResearchFiles();
  if (native) {
    if (process.env.YUNFENG_RESEARCH_NATIVE !== "3") throw new Error("范围读取需要新版 Rust 宿主");
    return native.readRange(cwd, path, start_line, line_count);
  }
  const text = await readProjectText(cwd, path), lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  return { content: lines.slice(start_line - 1, start_line - 1 + line_count).join(""), start_line, total_lines: lines.length, truncated: start_line > 1 || start_line - 1 + line_count < lines.length };
}
