// 文档检查核心回归：模块覆盖、错误汇总与历史链接边界。
// Created on 2026-10-19
// @author: https://github.com/Linmoqian
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkDocuments, collectDocuments } from '../check-docs.mjs';

function fixture(t, documents) {
  const root = mkdtempSync(join(tmpdir(), 'yunfeng-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(documents)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test('检查模块 README 并避开依赖与构建产物', (t) => {
  const root = fixture(t, { 'docs/index.md': '', 'server/src/research/README.md': '[坏链接](missing.md)',
    'app/node_modules/dependency/README.md': '[忽略](missing.md)', 'team-service/target/README.md': '' });
  const files = collectDocuments(root);
  assert.ok(files.includes(join(root, 'server/src/research/README.md')));
  assert.ok(!files.some((file) => file.includes('node_modules') || file.includes('target')));
  assert.deepEqual(checkDocuments(root, files.filter((file) => file === join(root, 'server/src/research/README.md'))), ['server/src/research/README.md: missing.md']);
});

test('汇总坏编码、缺失文档和失效目标，保留合法带空格及标题的链接', (t) => {
  const root = fixture(t, { 'docs/index.md': '[编码](bad%ZZ.md) [缺失](missing.md) [文件](<has space.md>) [标题](ok.md "说明") [查询](ok.md?view=1#heading) [远程](https://example.com) [锚点](#heading)\n```md\n[示例](ignored.md)\n```\n~~~md\n[示例](ignored.md)\n~~~', 'docs/has space.md': '', 'docs/ok.md': '' });
  assert.deepEqual(checkDocuments(root, [join(root, 'docs/index.md'), join(root, 'docs/absent.md')]),
    ['docs/index.md: 链接编码无效 bad%ZZ.md', 'docs/index.md: missing.md', 'docs/absent.md: 文档不存在']);
});

test('历史对话只豁免未入库的 Pi 参考，不掩盖其他断链', (t) => {
  const root = fixture(t, { 'docs/01-历史.md': '[参考](../pi/README.md) [失效](missing.md)', 'docs/current.md': '[参考](../pi/README.md)' });
  assert.deepEqual(checkDocuments(root, [join(root, 'docs/01-历史.md'), join(root, 'docs/current.md')]),
    ['docs/01-历史.md: missing.md', 'docs/current.md: ../pi/README.md']);
});
