/* execute 的原子文件写入：桌面复用 Rust，独立 Server 保留 Node 路径。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { mkdir, rename, writeFile, unlink, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { projectPath, evaluate } from "./project.js";
import { nativeResearchFiles } from "./native-files.js";
import type { FileWrite } from "./native-files.js";
import type { Condition, Result } from "./types.js";
import { toolArbiter, toolResources } from "./tool-arbiter.js";
async function writeNodeFile(cwd: string, path: string, content: string, signal: AbortSignal): Promise<void> {
  const target = await projectPath(cwd, path);
  await mkdir(dirname(target), { recursive: true });
  await projectPath(cwd, path);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: "wx" });
    signal.throwIfAborted();
    await projectPath(cwd, path);
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
}
/** 一个批次逐文件原子提交，失败可能部分完成；不自动重试，不跨命令/组件步骤合并。 */
export async function writeExecutionFiles(cwd: string, files: readonly FileWrite[], signal: AbortSignal, condition?: Condition): Promise<Result["evaluation"]> {
  signal.throwIfAborted();
  if (!files.length || files.length > 8) throw new Error("批量写入须为一到八个文件");
  for (const file of files) {
    if (Buffer.byteLength(file.content, "utf8") > 65536) throw new Error("文件内容超过 64 KiB 限制");
  }
  const native = nativeResearchFiles();
  let result: Result["evaluation"];
  if (native) result = await native.writeMany(cwd, files, condition);
  else {
    await toolArbiter.run({ tool: "modify", resources: toolResources(cwd, files.map((f) => f.path), true), signal,
      bytes: files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) }, async () => {
      for (const file of files) await projectPath(cwd, file.path);
      for (const file of files) { signal.throwIfAborted(); await writeNodeFile(cwd, file.path, file.content, signal); }
    });
    if (condition) result = await evaluate(cwd, condition);
  }
  signal.throwIfAborted();
  return result;
}
export async function writeExecutionFile(cwd: string, path: string, content: string, signal: AbortSignal): Promise<void> {
  await writeExecutionFiles(cwd, [{ path, content }], signal);
}
/** 唯一原文匹配才提交，文件大小沿用 64 KiB；不承诺外部进程的原子 CAS。 */
export async function patchExecutionFile(cwd: string, path: string, old_text: string, new_text: string, signal: AbortSignal): Promise<{ changed: boolean; bytes: number }> {
  signal.throwIfAborted();
  if (!old_text || [old_text, new_text].some((s) => typeof s !== "string" || Buffer.byteLength(s) > 65536)) throw new Error("精确修改文本无效或超过上限");
  const native = nativeResearchFiles();
  if (native) {
    if (process.env.YUNFENG_RESEARCH_NATIVE !== "3") throw new Error("精确修改需要新版 Rust 宿主");
    const result = await native.patch(cwd, path, old_text, new_text); signal.throwIfAborted(); return result;
  }
  return toolArbiter.run({ tool: "modify", resources: toolResources(cwd, [path], true), signal, bytes: Buffer.byteLength(new_text) }, async () => {
    const target = await projectPath(cwd, path);
    const info = await stat(target);
    if (!info.isFile() || info.size > 65536) throw new Error("修改对象必须是有界普通文件");
    const content = await readFile(target, "utf8");
    if (Buffer.byteLength(content) > 65536 || content.indexOf(old_text) < 0 || content.indexOf(old_text) !== content.lastIndexOf(old_text)) throw new Error("原文匹配冲突，请重新读取");
    const updated = content.replace(old_text, () => new_text);
    if (Buffer.byteLength(updated) > 65536) throw new Error("修改结果超过上限");
    if (await readFile(target, "utf8") !== content) throw new Error("文件已变化，请重新读取");
    await writeNodeFile(cwd, path, updated, signal);
    return { changed: content !== updated, bytes: Buffer.byteLength(updated) };
  });
}
