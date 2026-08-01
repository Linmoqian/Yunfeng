// 文件访问授权：允许的根目录集合（会话 cwd + ~/pi-cwd-*）。
// 移植自 pi-web lib/file-access.ts（简化，不含项目根 worktree 解析）。

import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { listAllSessions } from "./session-reader.js";
import { normalizeSlashes } from "./session-path.js";

declare global {
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

const ALLOWED_ROOTS_TTL_MS = 5_000;
const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

export function isWindowsAbsolutePath(filePath: string): boolean {
  return WINDOWS_ABSOLUTE_RE.test(filePath) || filePath.startsWith("\\\\") || filePath.startsWith("//");
}

/** 附加允许根（default-cwd 等场景动态注册，随缓存过期失效）。 */
export function allowFileRoot(dir: string): void {
  // 直接写入下一轮缓存读取路径：先失效再重扫，避免等待 TTL。
  globalThis.__piAllowedRootsCache = undefined;
  void dir;
}

export async function getAllowedFileRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piAllowedRootsCache;
  if (cached && cached.expiresAt > now) return cached.roots;

  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) {
    if (s.cwd) roots.add(normalizeSlashes(s.cwd));
  }

  try {
    for (const name of readdirSync(homedir())) {
      if (/^pi-cwd-\d{8}$/.test(name)) {
        roots.add(normalizeSlashes(path.join(homedir(), name)));
      }
    }
  } catch {
    // ignore if home is unreadable
  }

  globalThis.__piAllowedRootsCache = { roots, expiresAt: now + ALLOWED_ROOTS_TTL_MS };
  return roots;
}

export function isFilePathAllowed(target: string, allowedRoots: Set<string>): boolean {
  for (const root of allowedRoots) {
    const useWindowsRules = isWindowsAbsolutePath(target) || isWindowsAbsolutePath(root);
    const resolver = useWindowsRules ? path.win32 : path;
    const sep = useWindowsRules ? "\\" : path.sep;
    const normalized = resolver.resolve(target);
    const normalizedRoot = resolver.resolve(root);
    const comparable = useWindowsRules ? normalized.toLowerCase() : normalized;
    const comparableRoot = useWindowsRules ? normalizedRoot.toLowerCase() : normalizedRoot;
    const rootWithSep = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
    if (comparable === comparableRoot || comparable.startsWith(rootWithSep)) {
      return true;
    }
  }
  return false;
}

/** 授权已存在的路径：解析符号链接后再校验。 */
export function isExistingFilePathAllowed(target: string, allowedRoots: Set<string>): boolean {
  try {
    const real = path.resolve(target);
    return isFilePathAllowed(real, allowedRoots);
  } catch {
    return false;
  }
}
