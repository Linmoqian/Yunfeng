/* execute 的原子文件写入：桌面复用 Rust，独立 Server 保留 Node 路径。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { mkdir, rename, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { projectPath } from "./project.js";
import { nativeResearchFiles } from "./native-files.js";
export async function writeExecutionFile(cwd: string, path: string, content: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (Buffer.byteLength(content, "utf8") > 65536) throw new Error("文件内容超过 64 KiB 限制");
  const native = nativeResearchFiles();
  if (native) {
    await native.write(cwd, path, content);
    signal.throwIfAborted();
    return;
  }
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
