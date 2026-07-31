// 文件工作区 API：目录浏览与文件读取，限定在选定的项目根目录内。

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, sep, relative } from "node:path";
import type { FsEntry } from "./types";

const MAX_READ_BYTES = 512 * 1024;

/** 校验 path 位于 root 内，返回规范化后的绝对路径；越界抛错。 */
export function resolveInside(root: string, path: string): string {
  const rootResolved = resolve(root);
  const target = resolve(rootResolved, path);
  const rel = relative(rootResolved, target);
  if (rel === ".." || rel.startsWith(".." + sep) || rel.includes(sep + ".." + sep) || rel.endsWith(sep + "..")) {
    throw new Error(`Path escapes project root: ${path}`);
  }
  return target;
}

export async function listDir(root: string, path: string): Promise<FsEntry[]> {
  const dir = resolveInside(root, path);
  const entries = await readdir(dir, { withFileTypes: true });
  const result: FsEntry[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // 隐藏文件/目录
    const full = join(dir, e.name);
    let size = 0;
    let type: "file" | "dir" = e.isDirectory() ? "dir" : "file";
    if (e.isSymbolicLink()) {
      try {
        const st = await stat(full);
        type = st.isDirectory() ? "dir" : "file";
        if (type === "file") size = st.size;
      } catch {
        continue;
      }
    } else if (type === "file") {
      try {
        size = (await stat(full)).size;
      } catch {
        continue;
      }
    }
    result.push({
      name: e.name,
      path: full,
      type,
      size,
    });
  }
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

export async function readFileText(root: string, path: string): Promise<{ content: string; truncated: boolean }> {
  const file = resolveInside(root, path);
  const st = await stat(file);
  if (!st.isFile()) throw new Error("Not a file");
  const truncated = st.size > MAX_READ_BYTES;
  const handle = await import("node:fs/promises").then((m) => m.open(file, "r"));
  try {
    const buf = Buffer.alloc(Math.min(st.size, MAX_READ_BYTES));
    await handle.read(buf, 0, buf.length, 0);
    // 二进制文件检测：内容含 NUL 字节则按二进制处理
    if (buf.includes(0)) {
      return { content: `[binary file, ${st.size} bytes]`, truncated };
    }
    return { content: buf.toString("utf8"), truncated };
  } finally {
    await handle.close();
  }
}
