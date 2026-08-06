// git-operations 测试：基线、提交校验、敏感文件拒绝、Conventional Commits 消息。
// 使用临时 git 仓库，不触碰真实仓库。

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  commitTaskFiles,
  getTaskChanges,
  validateCommit,
  validateCommitMessage,
} from "../src/git-operations.js";

function tempRepo() {
  const rawDir = mkdtempSync(path.join(tmpdir(), "yf-git-test-"));
  const dir = realpathSync(rawDir);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(path.join(dir, "a.txt"), "base", "utf8");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "chore: 初始基线"], { cwd: dir });
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("validateCommitMessage 校验 Conventional Commits 中文提交信息", () => {
  assert.equal(validateCommitMessage("feat(server): 增加新功能"), null);
  assert.equal(validateCommitMessage("fix: 修复崩溃"), null);
  assert.equal(validateCommitMessage("feat(app)!: 破坏性变更"), null);
  assert.ok(validateCommitMessage("随便写的提交"), "非 Conventional 格式应被拒");
  assert.ok(validateCommitMessage(""), "空消息应被拒");
});

test("getTaskChanges 能识别任务文件类型", async () => {
  const repo = tempRepo();
  try {
    writeFileSync(path.join(repo.dir, "new.txt"), "hello", "utf8");
    writeFileSync(path.join(repo.dir, "a.txt"), "base-modified", "utf8");
    const { files } = await getTaskChanges(repo.dir);
    const byStatus = new Map(files.map((file) => [file.status, file]));
    assert.ok(byStatus.has("untracked"));
    assert.ok(byStatus.has("modified"));
  } finally {
    repo.cleanup();
  }
});

test("validateCommit 只提交任务产生文件，隔离基线脏文件", async () => {
  const repo = tempRepo();
  try {
    // 任务开始前 a.txt 已被改动（基线之后），记录为基线脏文件
    writeFileSync(path.join(repo.dir, "a.txt"), "pre-existing-dirty", "utf8");
    const baseline = [path.join(repo.dir, "a.txt")];
    // 任务新产生 b.txt
    writeFileSync(path.join(repo.dir, "b.txt"), "task-file", "utf8");

    const decision = await validateCommit({
      cwd: repo.dir,
      baseline,
      message: "feat: 新增 b 文件",
    });
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.stagedFiles, [path.join(repo.dir, "b.txt")]);
    assert.deepEqual(decision.excluded, [path.join(repo.dir, "a.txt")]);
  } finally {
    repo.cleanup();
  }
});

test("validateCommit 仅有基线脏文件时拒绝，需明确审批混入", async () => {
  const repo = tempRepo();
  try {
    writeFileSync(path.join(repo.dir, "a.txt"), "dirty", "utf8");
    const baseline = [path.join(repo.dir, "a.txt")];
    const decision = await validateCommit({ cwd: repo.dir, baseline, message: "feat: 提交" });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "includes_baseline");
  } finally {
    repo.cleanup();
  }
});

test("commitTaskFiles 提交成功并返回 sha；敏感文件被拒", async () => {
  const repo = tempRepo();
  try {
    writeFileSync(path.join(repo.dir, "ok.txt"), "content", "utf8");
    const result = await commitTaskFiles(repo.dir, [path.join(repo.dir, "ok.txt")], "feat: 提交文件");
    assert.equal(result.ok, true);
    assert.ok(result.commitSha);
  } finally {
    repo.cleanup();
  }
});

test("commitTaskFiles 拒绝敏感文件与构建产物", async () => {
  const repo = tempRepo();
  try {
    const sensResult = await commitTaskFiles(repo.dir, [path.join(repo.dir, ".env")], "feat: 提交");
    assert.equal(sensResult.ok, false, "敏感文件应被拒");
    const buildResult = await commitTaskFiles(repo.dir, [path.join(repo.dir, "node_modules")], "feat: 提交");
    assert.equal(buildResult.ok, false, "构建产物应被拒");
  } finally {
    repo.cleanup();
  }
});
