/* execute 的原子文件写入：桌面复用 Rust，独立 Server 保留 Node 路径。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { mkdir, rename, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { projectPath, evaluate } from "./project.js";
import { nativeResearchFiles } from "./native-files.js";
import type { FileWrite } from "./native-files.js";
import type { Condition, Result } from "./types.js";
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
    for (const file of files) await projectPath(cwd, file.path);
    for (const file of files) { signal.throwIfAborted(); await writeNodeFile(cwd, file.path, file.content, signal); }
    if (condition) result = await evaluate(cwd, condition);
  }
  signal.throwIfAborted();
  return result;
}
export async function writeExecutionFile(cwd: string, path: string, content: string, signal: AbortSignal): Promise<void> {
  await writeExecutionFiles(cwd, [{ path, content }], signal);
}
