/* Git diff 回归：未暂存状态列、重命名和字面量特殊路径。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { getGitFileDiff, getGitStatus } from "../src/git-changes.js";

test("未暂存修改与暂存重命名可读取，特殊路径不匹配其他文件", async () => {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "yf-git-diff-")));
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args]);
  try {
    git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
    const name = "源码 [1].ts";
    await writeFile(path.join(dir, name), "old\n");
    await writeFile(path.join(dir, "rename.ts"), "keep\noriginal\n");
    git("add", "--", name, "rename.ts"); git("commit", "-qm", "initial");
    await writeFile(path.join(dir, name), "new\n");
    const diff = await getGitFileDiff(dir, path.join(dir, name));
    assert.equal(diff.supported, true);
    assert.match(diff.patch!, /\n-old\n\+new/);
    assert.ok((await getGitStatus(dir)).files.some((file) => file.filePath === path.join(dir, name)));
    git("mv", "rename.ts", "renamed.ts");
    await writeFile(path.join(dir, "renamed.ts"), "keep\nchanged\n");
    const renamed = await getGitFileDiff(dir, path.join(dir, "renamed.ts"));
    assert.equal(renamed.supported, true);
    assert.match(renamed.patch!, /\+changed/);
    await writeFile(path.join(dir, ":(glob)*"), "literal\n");
    const literal = await getGitFileDiff(dir, path.join(dir, ":(glob)*"));
    assert.match(literal.patch!, /\+literal/);
    assert.doesNotMatch(literal.patch!, /\+changed/);
    assert.equal((await getGitFileDiff(dir, path.join(dir, "..", "outside.ts"))).supported, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
