// 检查当前文档的本地链接；历史对话中的参考检出链接不作为可移植入口。
// Created on 2026-10-15
// @author: https://github.com/Linmoqian
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}
const files = [
  ...markdownFiles(join(root, 'docs')),
  ...['README.md', 'AGENTS.md', 'CLAUDE.md', 'RULES.md', 'MEMORY.md', 'app/README.md', 'server/README.md', 'mobile-app/README.md', '.agents/README.md', 'pi-assets/agents/README.md'].map((path) => join(root, path)),
];
const failures = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    // 原话不重写；pi/ 是未入库的历史参考检出，索引已标明这一限制。
    if (/\/0[1-4]-[^/]+\.md$/.test(file) && target.startsWith('../pi/')) continue;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(target)))) failures.push(`${file.slice(root.length + 1)}: ${target}`);
  }
}
if (failures.length) {
  console.error(`[错误] ${failures.length} 个文档链接目标不存在\n${failures.join('\n')}`);
  process.exitCode = 1;
} else console.log(`[成功] ${files.length} 份文档的本地链接检查通过`);
