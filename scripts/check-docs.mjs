// 检查项目文档与模块 README 的本地链接，汇总错误而不改写历史原话。
// Created on 2026-10-19
// @author: https://github.com/Linmoqian
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const excluded = new Set(['node_modules', 'target', 'dist', 'build', 'coverage', 'vendor']);
function markdownFiles(directory, readmesOnly = false) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name.startsWith('.') || excluded.has(entry.name) || entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return markdownFiles(path, readmesOnly);
    return (readmesOnly ? entry.name === 'README.md' : /\.mdx?$/.test(entry.name)) ? [path] : [];
  });
}

/** 收集当前说明与模块 README；第三方技能和构建目录不属于维护范围。 */
export function collectDocuments(root) {
  const modules = ['app', 'packages', 'server', 'gateway', 'team-service', 'server-rpc', 'pi-assets'];
  return [...new Set([
    ...markdownFiles(join(root, 'docs')),
    ...modules.filter((name) => existsSync(join(root, name))).flatMap((name) => markdownFiles(join(root, name), true)),
    ...['README.md', 'AGENTS.md', 'CLAUDE.md', 'RULES.md', 'MEMORY.md', '.agents/README.md'].map((path) => join(root, path)),
  ])];
}

/** 返回缺失文档、非法编码与失效链接；不验证标题锚点或远程地址。 */
export function checkDocuments(root, files) {
  const failures = [];
  for (const file of files) {
    const label = relative(root, file).split(sep).join('/');
    if (!existsSync(file)) { failures.push(`${label}: 文档不存在`); continue; }
    const source = readFileSync(file, 'utf8').replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
    for (const match of source.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^)]*["'])?\s*\)/g)) {
      const target = (match[1] ?? match[2]).split(/[?#]/)[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
      // 原话不重写；pi/ 是未入库的历史参考检出。
      if (/[/\\]0[1-4]-[^/\\]+\.md$/.test(file) && target.startsWith('../pi/')) continue;
      try {
        if (!existsSync(resolve(dirname(file), decodeURIComponent(target)))) failures.push(`${label}: ${target}`);
      } catch (error) {
        if (!(error instanceof URIError)) throw error;
        failures.push(`${label}: 链接编码无效 ${target}`);
      }
    }
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = collectDocuments(root);
  const failures = checkDocuments(root, files);
  if (failures.length) {
    console.error(`[错误] ${failures.length} 个文档问题\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else console.log(`[成功] ${files.length} 份文档的本地链接检查通过`);
}
