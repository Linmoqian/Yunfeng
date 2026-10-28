// 验证工作流存储重启恢复、并发冲突与接口校验。
// Created on 2026-10-28
// @author: https://github.com/Linmoqian

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { handleWorkflow } from "../src/taskboard/workflow-routes.js";
import { WorkflowStore } from "../src/taskboard/workflow-store.js";

test("工作流保存后可恢复，旧版本不能覆盖，项目相互隔离", () => {
  const dir = mkdtempSync(join(tmpdir(), "yunfeng-board-"));
  try {
    const store = new WorkflowStore(dir);
    const workspace = { tabs: [{ id: "first", name: "流程" }] };
    assert.equal(handleWorkflow("project-a", "PUT", { workspace, version: 0 }, store).status, 200);
    const recovered = new WorkflowStore(dir);
    assert.deepEqual(recovered.read("project-a").workspace, workspace);
    assert.equal(handleWorkflow("project-a", "PUT", { workspace: {}, version: 0 }, recovered).status, 409);
    assert.deepEqual(recovered.read("project-a").workspace, workspace);
    assert.equal(recovered.read("project-b").version, 0);
    assert.equal(handleWorkflow("project-a", "PUT", { workspace: null, version: 1 }, recovered).status, 400);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
