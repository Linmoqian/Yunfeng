// Git 操作（受策略保护）：任务基线对比、安全提交、推送审批。
// 阶段 4：不实现逐行暂存、变基、冲突解决和完整分支管理。

import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { GitFileStatus } from "./types.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;

async function git(cwd: string, args: string[], maxBuffer = 8 * 1024 * 1024): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer,
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout;
}

/** 敏感文件：拒绝提交 .env、密钥、缓存与构建产物。 */
const SENSITIVE_FILE_RE = /(^|[\\/])(\.env(\.|$)|\.env\..*|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$)/i;
const BUILD_ARTIFACT_RE = /(^|[\\/])(node_modules|dist|build|\.next|\.turbo|__pycache__|\.pytest_cache|\.cache|coverage|target|vendor|\.venv|venv)([\\/]|$)/i;

interface PorcelainEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
}

function parsePorcelain(output: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  const parts = output.split("\0");
  for (const part of parts) {
    if (part.length === 0) continue;
    const match = /^([ MDARC?])([ MDARC?]) (.*)$/.exec(part);
    if (match) {
      entries.push({ path: match[3], indexStatus: match[1], worktreeStatus: match[2].trim() });
    }
  }
  return entries;
}

function toGitPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/** 获取任务当前的 Git 变更（含 untracked）。 */
export async function getTaskChanges(cwd: string): Promise<{ repoRoot: string; files: GitFileStatus[] }> {
  let repoRoot: string;
  try {
    repoRoot = realpathSync((await git(cwd, ["rev-parse", "--show-toplevel"])).trim());
  } catch {
    return { repoRoot: "", files: [] };
  }
  const output = await git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const relativeCwd = toGitPath(path.relative(repoRoot, cwd));
  const isWithin = (filePath: string): boolean => {
    const rel = path.relative(repoRoot, filePath);
    return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
  };

  const files = parsePorcelain(output)
    .map((entry) => {
      const abs = path.resolve(repoRoot, entry.path);
      if (!isWithin(abs)) return null;
      const modified = entry.indexStatus === "M" || entry.worktreeStatus.includes("M");
      const added = entry.indexStatus === "A";
      const deleted = entry.indexStatus === "D" || entry.worktreeStatus.includes("D");
      const untracked = entry.worktreeStatus === "?" || entry.worktreeStatus === "??";
      let status: GitFileStatus["status"];
      if (untracked) status = "untracked";
      else if (deleted) status = "deleted";
      else if (added) status = "added";
      else if (modified) status = "modified";
      else status = "modified";
      return {
        filePath: abs,
        status,
        indexStatus: entry.indexStatus,
        worktreeStatus: entry.worktreeStatus,
      } as GitFileStatus;
    })
    .filter((file): file is GitFileStatus => file !== null);

  return { repoRoot, files };
}

function isSensitive(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/");
  return SENSITIVE_FILE_RE.test(norm) || BUILD_ARTIFACT_RE.test(norm);
}

export interface ValidateCommitInput {
  cwd: string;
  baseline: string[];
  message: string;
  paths?: string[];
}

export interface CommitDecision {
  allowed: boolean;
  reason?: "ok" | "no_git" | "empty" | "includes_baseline" | "sensitive_only" | "no_paths" | "invalid_message";
  stagedFiles?: string[];
  excluded?: string[];
  messageError?: string;
}

/** 服务端校验 Conventional Commits 中文提交信息。 */
export function validateCommitMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return "提交信息不能为空";
  // 允许中英文 Conventional Commits，如 feat(server): xxx / fix: 修复
  if (!/^[a-z]+(\([a-z0-9_-]+\))?!?: .+/.test(trimmed)) {
    return "提交信息需符合 Conventional Commits 格式，例如：feat(server): 增加新功能";
  }
  if (trimmed.length > 100) return "提交信息过长（建议不超过 100 字符）";
  return null;
}

/**
 * 校验并准备一次任务提交。
 * 规则：默认只提交任务产生且未在基线（任务开始前已脏污）的文件；
 * 混入基线已有改动、或仅敏感/缓存文件 → 拒绝。
 */
export async function validateCommit(input: ValidateCommitInput): Promise<CommitDecision> {
  const { cwd, baseline, message } = input;
  const baselineSet = new Set(baseline.map((p) => path.resolve(p)));
  const messageError = validateCommitMessage(message);
  if (messageError) return { allowed: false, reason: "invalid_message", messageError };

  const { repoRoot, files } = await getTaskChanges(cwd);
  if (!repoRoot) return { allowed: false, reason: "no_git" };

  const candidates = files
    .filter((file) => file.status !== "untracked" || !isSensitive(file.filePath))
    .filter((file) => !BUILD_ARTIFACT_RE.test(toGitPath(file.filePath)))
    .map((file) => file.filePath);

  if (candidates.length === 0) return { allowed: false, reason: "empty" };

  // 排除任务开始前已存在的脏文件（基线内容）
  const excludesBaseline = candidates.filter((p) => baselineSet.has(p));
  const taskFiles = candidates.filter((p) => !baselineSet.has(p));

  if (taskFiles.length === 0) {
    return { allowed: false, reason: "includes_baseline", excluded: excludesBaseline };
  }

  return {
    allowed: true,
    reason: "ok",
    stagedFiles: taskFiles,
    excluded: excludesBaseline,
  };
}

export interface CommitResult {
  ok: boolean;
  commitSha?: string;
  message?: string;
  files?: string[];
}

/** 执行一次本地安全提交（只提交选定的任务文件）。 */
export async function commitTaskFiles(cwd: string, files: string[], message: string): Promise<CommitResult> {
  const { repoRoot } = await getTaskChanges(cwd);
  if (!repoRoot) return { ok: false, message: "不是 Git 仓库" };

  if (files.some((file) => isSensitive(file))) {
    return { ok: false, message: "包含敏感或缓存文件，已拒绝提交" };
  }

  // 逐个精确 add，避免提交其他无关文件
  for (const file of files) {
    await git(cwd, ["add", "--", toGitPath(path.relative(repoRoot, file))]);
  }
  const commits = await git(cwd, ["commit", "-m", message], 2 * 1024 * 1024);
  // 提取 commit sha
  const rev = (await git(cwd, ["rev-parse", "HEAD"])).trim();
  return { ok: true, commitSha: rev, message, files };
}

export interface PushDecision {
  allowed: boolean;
  reason?: "no_git" | "no_branch" | "no_upstream" | "ok";
  branch?: string;
  remote?: string;
}

/** 检查推送前置条件（不执行远程操作）。 */
export async function checkPush(cwd: string): Promise<PushDecision> {
  let repoRoot: string;
  try {
    repoRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return { allowed: false, reason: "no_git" };
  }
  let branch: string;
  try {
    branch = (await git(repoRoot, ["symbolic-ref", "--short", "HEAD"])).trim();
  } catch {
    return { allowed: false, reason: "no_branch" };
  }
  const remote = (await git(repoRoot, ["config", `branch.${branch}.remote`]).catch(() => ""));
  if (!remote.trim()) return { allowed: false, reason: "no_upstream", branch };
  return { allowed: true, reason: "ok", branch, remote: remote.trim() };
}

/** 推送前的实际执行（仅在审批通过后由调用方触发）。 */
export async function pushRemote(cwd: string, remote?: string, branch?: string): Promise<{ ok: boolean; message?: string }> {
  const { repoRoot } = await getTaskChanges(cwd);
  if (!repoRoot) return { ok: false, message: "不是 Git 仓库" };
  const actualRemote = remote ?? (await git(repoRoot, ["remote"]).then((r) => r.trim().split("\n")[0] ?? "").catch(() => ""));
  const actualBranch = branch ?? (await git(repoRoot, ["symbolic-ref", "--short", "HEAD"]).catch(() => ""));
  try {
    await git(repoRoot, ["push", actualRemote, actualBranch], 8 * 1024 * 1024);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "推送失败" };
  }
}

export function readFileIfAllowed(filePath: string, maxBytes = 256 * 1024): string | null {
  try {
    const st = statSync(filePath);
    if (!st.isFile() || st.size > maxBytes) return null;
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}
