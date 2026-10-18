/* 观察真实项目与核验实验条件，路径始终限制在项目根内。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { lstat, realpath, readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { freemem, totalmem, platform } from "node:os";
import type { Condition, Result, State } from "./types.js";
import { nativeResearchFiles } from "./native-files.js";
import type { FileRead } from "./native-files.js";
const exec = promisify(execFile);
const privatePart = /^(?:\.env(?:\..*)?|auth\.json|models\.json|credentials.*|.*\.(?:pem|key)|\.git|node_modules)$/i;

/** 校验既有父目录的真实路径；拒绝敏感文件、链接和项目外路径。 */
export async function projectPath(cwd: string, input: string): Promise<string> {
  if (!input || isAbsolute(input) || input.includes("\0")) throw new Error("需要项目内相对路径");
  const root = await realpath(cwd);
  const target = resolve(root, input);
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel) || rel.split(sep).some((part) => privatePart.test(part))) throw new Error("路径越界或涉及敏感资源");
  let ancestor = target;
  while (ancestor !== root) {
    try {
      const info = await lstat(ancestor);
      if (info.isSymbolicLink()) throw new Error("科研文件路径不能包含符号链接");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    ancestor = dirname(ancestor);
  }
  return target;
}

export async function readProjectText(cwd: string, path: string): Promise<string> {
  const native = nativeResearchFiles();
  if (native) return native.read(cwd, path);
  const file = await projectPath(cwd, path);
  const info = await stat(file);
  if (!info.isFile() || info.size > 65536) throw new Error("观察文件必须为不超过 64 KiB 的普通文件");
  return readFile(file, "utf8");
}

/** 一次观察范围显式提交；单个文件缺失保留该位置的错误，不丢弃其他真实事实。 */
export async function readProjectFiles(cwd: string, paths: readonly string[]): Promise<FileRead[]> {
  if (!paths.length) return [];
  if (paths.length > 8) throw new Error("观察路径超过上限");
  const native = nativeResearchFiles();
  if (native) return native.readMany(cwd, paths);
  const results: FileRead[] = [];
  for (const path of paths) {
    try { results.push({ content: await readProjectText(cwd, path) }); }
    catch (error) { results.push({ error: (error as Error).message }); }
  }
  return results;
}

export async function observeProject(cwd: string, paths: string[], memory: unknown[], events: unknown[]): Promise<State> {
  const timestamp = new Date().toISOString();
  const facts: State["facts"] = [];
  const add = (key: string, value: unknown, source: string) => facts.push({ key, value, timestamp, source });
  add("project.cwd", await realpath(cwd), "filesystem.realpath");
  add("project.files", (await readdir(cwd)).filter((p) => !privatePart.test(p)).slice(0, 80), "filesystem.readdir");
  add("system.memory", { free: freemem(), total: totalmem(), platform: platform() }, "node:os");
  try {
    const result = await exec("git", ["status", "--porcelain"], { cwd, timeout: 5000, maxBuffer: 65536 });
    add("git.status", result.stdout, "git status --porcelain");
  } catch { add("git.status", null, "git unavailable or not a repository"); }
  let defaults = ["README.md", "package.json"];
  try {
    const folder = await projectPath(cwd, ".lin/experiments");
    defaults = [...defaults, ...(await readdir(folder)).filter((name) => /\.(json|ya?ml|log|md)$/.test(name)).slice(0, 6).map((name) => `.lin/experiments/${name}`)];
  } catch { /* 新项目可以没有实验目录。 */ }
  const selected = [...new Set([...paths, ...defaults])].slice(0, 8);
  let results: FileRead[];
  try { results = await readProjectFiles(cwd, selected); }
  catch (error) { results = selected.map(() => ({ error: (error as Error).message })); }
  for (let index = 0; index < selected.length; index++) {
    const path = selected[index]!, result = results[index]!;
    add(`file:${path}`, result.content ?? { unavailable: result.error }, `filesystem:${path}`);
  }
  return { facts, events, memory, constraints: ["未知指标和设备状态不得当作事实", "仅 execute 允许项目副作用", "反思知识是候选推断", "命令受权限清单或具体计划授权限制"] };
}

export async function evaluate(cwd: string, condition?: Condition): Promise<NonNullable<Result["evaluation"]>> {
  if (!condition) return { passed: false, reason: "缺少验收条件" };
  try {
    const native = nativeResearchFiles();
    if (native) return await native.evaluate(cwd, condition);
    const file = await projectPath(cwd, condition.path);
    if (condition.kind === "file_exists") {
      const passed = (await stat(file)).isFile();
      return { passed, actual: passed, reason: "核验普通文件存在" };
    }
    const data = JSON.parse(await readProjectText(cwd, condition.path));
    const actual = condition.key.split(".").reduce((item: unknown, key) => item && typeof item === "object" && Object.hasOwn(item, key) ? (item as Record<string, unknown>)[key] : undefined, data);
    if (typeof actual !== "number" || !Number.isFinite(actual)) return { passed: false, reason: "指标不存在或不是有限数值" };
    const target = condition.value;
    const passed = { ">": actual > target, ">=": actual >= target, "<": actual < target, "<=": actual <= target, "==": actual === target }[condition.operator];
    return { passed, actual, reason: `${condition.path}:${condition.key} ${condition.operator} ${target}` };
  } catch (error) { return { passed: false, reason: (error as Error).message }; }
}
