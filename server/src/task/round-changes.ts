/* 单轮文件基线与增删行统计：复用任务存储，不改动仓库索引或工作区。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { isUtf8 } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const LIMIT = 256 * 1024;
const excluded = /(^|\/)(\.git|node_modules|target|dist|\.env[^/]*|auth\.json|models\.json|credentials\.json|id_rsa|id_ed25519)(\/|$)|\.(pem|key|p12)$/i;
type FileSnapshot = { hash: string; text?: string };
export interface RoundChanges {
  schemaVersion: 1;
  id: string;
  startedAt: string;
  completedAt?: string;
  interrupted?: boolean;
  root: string;
  cwd: string;
  head: string;
  baseline: Record<string, FileSnapshot>;
  files: Array<{ filePath: string; status: string; additions: number | null; deletions: number | null }>;
}
export type RoundSummary = Omit<RoundChanges, "baseline" | "head" | "cwd" | "schemaVersion">;

async function git(cwd: string, args: string[]): Promise<string> {
  return (await run("git", ["--literal-pathspecs", "-C", cwd, ...args], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 })).stdout;
}
function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
async function changedPaths(cwd: string, head: string): Promise<string[]> {
  const outputs = await Promise.all([
    git(cwd, ["ls-files", "--others", "--exclude-standard", "-z", "--", "."]),
    git(cwd, head ? ["diff", "--name-only", "--relative", "-z", head, "--", "."] : ["ls-files", "--cached", "-z", "--", "."]),
  ]);
  const names = [...new Set(outputs.flatMap((text) => text.split("\0").filter(Boolean)))];
  if (names.length > 2000) throw new Error("本轮变更超过 2000 个文件，无法统计");
  return names.filter((name) => !excluded.test(name) && !/(^|\/)\.lin\/agent(\/|$)/.test(name));
}
async function snapshot(cwd: string, name: string): Promise<FileSnapshot | undefined> {
  const file = path.resolve(cwd, name);
  if (!inside(cwd, file)) throw new Error("变更路径超出项目范围");
  let info;
  try { info = await lstat(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  if (!info.isFile()) return { hash: `unsupported:${info.mode}:${info.size}:${info.mtimeMs}` };
  if (!inside(cwd, await realpath(file))) throw new Error("变更路径通过链接超出项目范围");
  if (info.size > LIMIT) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return { hash: hash.digest("hex") };
  }
  const content = await readFile(file);
  return { hash: createHash("sha256").update(content).digest("hex"), ...(!content.includes(0) && isUtf8(content) ? { text: content.toString("utf8") } : {}) };
}
/** 在执行前捕获既有脏文件；未修改的跟踪文件以后从固定 HEAD 读取。 */
export async function beginRound(cwd: string): Promise<RoundChanges | null> {
  let root: string;
  try { root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim(); } catch { return null; }
  let head = "";
  try { head = (await git(cwd, ["rev-parse", "--verify", "HEAD"])).trim(); } catch { /* 新仓库尚无提交。 */ }
  cwd = await realpath(cwd);
  const baseline: RoundChanges["baseline"] = Object.create(null);
  let bytes = 0;
  for (const name of await changedPaths(cwd, head)) {
    const value = await snapshot(cwd, name);
    if (value) {
      bytes += Buffer.byteLength(value.text ?? "");
      if (bytes > 16 * 1024 * 1024) throw new Error("本轮基线超过 16 MiB，无法统计");
      baseline[name] = value;
    } else baseline[name] = { hash: "absent" };
  }
  return { schemaVersion: 1, id: randomUUID(), startedAt: new Date().toISOString(), root, cwd, head, baseline, files: [] };
}
async function original(round: RoundChanges, name: string): Promise<FileSnapshot | undefined> {
  if (Object.hasOwn(round.baseline, name)) return round.baseline[name].hash === "absent" ? undefined : round.baseline[name];
  if (!round.head) return undefined;
  const relative = path.relative(round.root, path.resolve(round.cwd, name)).split(path.sep).join("/");
  // ls-tree 区分原本不存在与 Git 读取失败，避免把错误当成新增文件。
  const entry = await git(round.root, ["ls-tree", round.head, "--", relative]);
  if (!entry) return undefined;
  const size = Number((await git(round.root, ["cat-file", "-s", `${round.head}:${relative}`])).trim());
  if (size > LIMIT) return { hash: `large:${entry}` };
  const { stdout: content } = await run("git", ["-C", round.root, "show", `${round.head}:${relative}`], { encoding: "buffer", timeout: 10000, maxBuffer: LIMIT * 2 });
  return { hash: createHash("sha256").update(content).digest("hex"), ...(!content.includes(0) && isUtf8(content) ? { text: content.toString("utf8") } : {}) };
}
async function lineCounts(before: string, after: string): Promise<{ additions: number; deletions: number }> {
  const dir = await mkdtemp(path.join(tmpdir(), "yf-round-"));
  try {
    const left = path.join(dir, "before"), right = path.join(dir, "after");
    await writeFile(left, before, { mode: 0o600 });
    await writeFile(right, after, { mode: 0o600 });
    let output: string;
    try { output = (await run("git", ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--numstat", "--", left, right], { timeout: 10000 })).stdout; }
    catch (error) { if ((error as { code?: number }).code !== 1) throw error; output = String((error as { stdout: string }).stdout); }
    const [added, deleted] = output.split("\t");
    return { additions: Number(added || 0), deletions: Number(deleted || 0) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
/** 仅比较本轮开始与当前内容；完成后快照冻结，不纳入后续外部修改。 */
export async function measureRound(round: RoundChanges, complete = false): Promise<RoundChanges> {
  if (round.completedAt) return round;
  const names = new Set([...Object.keys(round.baseline), ...await changedPaths(round.cwd, round.head)]);
  if (names.size > 2000) throw new Error("本轮变更超过 2000 个文件，无法统计");
  const files: RoundChanges["files"] = [];
  for (const name of names) {
    const before = await original(round, name), after = await snapshot(round.cwd, name);
    if (before?.hash === after?.hash) continue;
    const supported = (!before || before.text !== undefined) && (!after || after.text !== undefined);
    const counts = supported ? await lineCounts(before?.text ?? "", after?.text ?? "") : { additions: null, deletions: null };
    files.push({ filePath: path.resolve(round.cwd, name), status: !before ? "added" : !after ? "deleted" : "modified", ...counts });
  }
  return { ...round, files, ...(complete ? { completedAt: new Date().toISOString(), baseline: {}, head: "" } : {}) };
}
export function roundSummary(round: RoundChanges | null): RoundSummary | null {
  if (!round) return null;
  const { baseline: _baseline, head: _head, cwd: _cwd, schemaVersion: _version, ...summary } = round;
  return summary;
}
