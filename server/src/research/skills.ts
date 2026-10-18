/* 显式选择科研 skill，只载入限定目录内的有界说明文本。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { loadSkills, type Skill } from "../agent/sdk.js";

/** 任务只保存稳定名称；旧任务未选择时不加载任何 skill。 */
export function parseResearchSkills(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5 || value.some((name) => typeof name !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name))) throw new Error("科研 skills 需要最多五个合法名称");
  if (new Set(value).size !== value.length) throw new Error("科研 skills 不能重复");
  return [...value];
}

async function selectedFile(roots: string[], name: string): Promise<string> {
  for (const root of roots) {
    const file = join(root, name, "SKILL.md");
    try {
      const anchor = await realpath(root), target = await realpath(file);
      const path = relative(anchor, target);
      if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) throw new Error(`科研 skill 越出资源目录：${name}`);
      if (!(await lstat(file)).isFile()) throw new Error(`科研 skill 必须是普通文件：${name}`);
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`科研 skill 不存在：${name}`);
}

/** 只用 SDK 解析选中文件的元信息；正文直接注入资源上下文，不开放读取或执行工具。 */
export async function loadResearchSkills(cwd: string, agentDir: string, names: readonly string[]): Promise<{ skills: Skill[]; prompts: string[] }> {
  parseResearchSkills(names);
  const roots = [join(cwd, ".lin/skills"), join(cwd, ".agents/skills"), join(agentDir, "skills")];
  const skills: Skill[] = [], prompts: string[] = [];
  let total = 0;
  for (const name of names) {
    const file = await selectedFile(roots, name);
    const handle = await open(file, "r");
    let content: string;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 32768) throw new Error(`科研 skill 超过 32 KiB：${name}`);
      const buffer = Buffer.alloc(32769);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
        if (!chunk.bytesRead) break;
        bytesRead += chunk.bytesRead;
      }
      if (bytesRead > 32768 || (total += bytesRead) > 65536) throw new Error("科研 skill 总大小超过 64 KiB");
      content = buffer.subarray(0, bytesRead).toString("utf8");
    } finally { await handle.close(); }
    const loaded = loadSkills({ cwd, agentDir, skillPaths: [file], includeDefaults: false });
    if (loaded.skills.length !== 1 || loaded.skills[0]!.name !== name || loaded.diagnostics.length) throw new Error(`科研 skill 元信息无效：${name}`);
    skills.push(loaded.skills[0]!);
    prompts.push(`已显式选择的科研 skill ${name}（目录 ${loaded.skills[0]!.baseDir}）：\n${content}\n技能仅提供研究方法。所有写入、脚本和实验命令必须提交计划并经过 execute；不得绕过阶段 JSON 契约、权限或实测验收。`);
  }
  return { skills, prompts };
}
