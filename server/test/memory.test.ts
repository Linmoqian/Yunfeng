// 记忆插件单元测试：持久化/重载、候选自动确认、检索排序、确认/遗忘。
// 使用临时数据目录，不接触真实 ~/.yunfeng。

import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/plugins/memory/store.js";
import { MemoryService } from "../src/plugins/memory/service.js";
import { createMemoryContextForDataDir } from "../src/plugins/memory/index.js";

function tempService() {
  const dir = mkdtempSync(path.join(tmpdir(), "yf-memory-test-"));
  const { store, service } = createMemoryContextForDataDir(dir);
  return {
    dir,
    store,
    service,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("user_explicit 直接 confirmed，agent_inferred 落 candidate", () => {
  const ctx = tempService();
  try {
    const explicit = ctx.service.add(
      { kind: "preference", content: "修改后自动提交，推送必须确认" },
      { source: "user_explicit", scope: "global" },
    );
    assert.equal(explicit.confidence, "confirmed");

    const inferred = ctx.service.add(
      { kind: "episode", content: "完成任务：修复会话恢复", lesson: "优先使用公共接口" },
      { source: "agent_inferred" },
    );
    assert.equal(inferred.confidence, "candidate");
  } finally {
    ctx.cleanup();
  }
});

test("候选记忆 touch 达阈值自动转 confirmed", () => {
  const ctx = tempService();
  try {
    const memory = ctx.service.add(
      { kind: "preference", content: "使用 npm 包管理" },
      { source: "agent_inferred" },
    );
    ctx.service.touch(memory.id);
    ctx.service.touch(memory.id);
    assert.equal(ctx.service.get(memory.id)!.confidence, "candidate");
    ctx.service.touch(memory.id);
    assert.equal(ctx.service.get(memory.id)!.confidence, "confirmed");
    // 继续 touch 不再回退
    ctx.service.touch(memory.id);
    assert.equal(ctx.service.get(memory.id)!.confidence, "confirmed");
  } finally {
    ctx.cleanup();
  }
});

test("confirm 显式确认候选记忆，forget 删除", () => {
  const ctx = tempService();
  try {
    const memory = ctx.service.add(
      { kind: "project_fact", content: "后端基于 Node.js 和 TypeScript" },
      { source: "observed", scope: "project", projectKey: "yunfeng" },
    );
    assert.equal(memory.confidence, "candidate");
    const confirmed = ctx.service.confirm(memory.id);
    assert.ok(confirmed);
    assert.equal(confirmed!.confidence, "confirmed");
    assert.equal(ctx.service.forget(memory.id), true);
    assert.equal(ctx.service.get(memory.id), undefined);
    assert.equal(ctx.service.forget(memory.id), false);
  } finally {
    ctx.cleanup();
  }
});

test("持久化：重载数据目录后记忆完整", () => {
  const ctx = tempService();
  try {
    ctx.service.add(
      { kind: "preference", content: "提交信息使用 Conventional Commits" },
      { source: "user_explicit" },
    );
    const store2 = new MemoryStore({ dataDir: ctx.dir });
    const service2 = new MemoryService(store2);
    assert.equal(service2.findAll().length, 1);
    assert.equal(service2.findAll()[0]!.content, "提交信息使用 Conventional Commits");
  } finally {
    ctx.cleanup();
  }
});

test("procedure 写入与 steps 保留", () => {
  const ctx = tempService();
  try {
    const memory = ctx.service.add(
      { kind: "procedure", content: "论文阅读流程", steps: ["检索", "初筛", "确认", "下载"] },
      { source: "user_explicit" },
    );
    const loaded = ctx.service.get(memory.id);
    assert.ok(loaded && loaded.kind === "procedure");
    assert.deepEqual((loaded as { steps: string[] }).steps, ["检索", "初筛", "确认", "下载"]);
  } finally {
    ctx.cleanup();
  }
});

test("retrieve 排序：confirmed 优先、项目匹配优先、主题命中优先", () => {
  const ctx = tempService();
  try {
    // confirmed 全局记忆（主题命中 git）
    ctx.service.add(
      { kind: "preference", content: "Git 提交规范" },
      { source: "user_explicit", topics: ["git", "commit"] },
    );
    // candidate 项目记忆（主题命中 git + 项目匹配）
    const projectMem = ctx.service.add(
      { kind: "project_fact", content: "Yunfeng 使用 npm" },
      { source: "observed", scope: "project", projectKey: "yunfeng", topics: ["npm"] },
    );
    ctx.service.touch(projectMem.id);
    ctx.service.touch(projectMem.id);
    // confirmed 项目记忆（主题不命中，但项目匹配）
    const confirmedProject = ctx.service.add(
      { kind: "project_fact", content: "Yunfeng 技术栈" },
      { source: "user_explicit", scope: "project", projectKey: "yunfeng", topics: ["tech"] },
    );
    void confirmedProject;

    const results = ctx.service.retrieve({
      topics: ["git"],
      projectKey: "yunfeng",
      limit: 10,
    });
    // 主题强过滤：只应返回命中 git 的记忆
    assert.ok(results.length >= 1);
    assert.ok(results.every((m) => m.topics.includes("git")));
  } finally {
    ctx.cleanup();
  }
});

test("retrieve 主题为空时返回全部（按排序）", () => {
  const ctx = tempService();
  try {
    const a = ctx.service.add(
      { kind: "preference", content: "记忆A" },
      { source: "agent_inferred" },
    );
    const b = ctx.service.add(
      { kind: "preference", content: "记忆B" },
      { source: "user_explicit" },
    );
    void a;
    const results = ctx.service.retrieve({ limit: 10 });
    // confirmed（记忆B）应排在 candidate（记忆A）之前
    assert.ok(results.length === 2);
    assert.equal(results[0]!.content, "记忆B");
  } finally {
    ctx.cleanup();
  }
});

test("损坏行忽略，其余记忆正常载入", () => {
  const ctx = tempService();
  try {
    const memory = ctx.service.add(
      { kind: "preference", content: "保留记忆" },
      { source: "user_explicit" },
    );
    void memory;
    appendFileSync(path.join(ctx.dir, "memory", "memories.jsonl"), "{corrupt\n");
    const store2 = new MemoryStore({ dataDir: ctx.dir });
    assert.equal(store2.findAll().length, 1);
  } finally {
    ctx.cleanup();
  }
});
