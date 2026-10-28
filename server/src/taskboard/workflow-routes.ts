// 看板工作流读写接口。
// Created on 2026-10-28
// @author: https://github.com/Linmoqian

import { json, type RouteResult } from "../routes.js";
import { getYunfengDataDir } from "../task/task-store.js";
import { WorkflowStore, WorkflowVersionConflict } from "./workflow-store.js";

export function handleWorkflow(projectId: string, method: string, body: Record<string, unknown> = {}, store = new WorkflowStore(getYunfengDataDir())): RouteResult {
  if (!projectId || projectId.length > 512) return json({ error: { code: "BAD_REQUEST", message: "项目 ID 无效" } }, 400);
  if (method === "GET") return json(store.read(projectId));
  if (method !== "PUT") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "不支持该操作" } }, 405);
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 0 || !body.workspace || typeof body.workspace !== "object" || Array.isArray(body.workspace) || JSON.stringify(body.workspace).length > 2_000_000) {
    return json({ error: { code: "BAD_REQUEST", message: "工作流数据或版本无效" } }, 400);
  }
  try { return json(store.save(projectId, body.workspace as object, body.version as number)); }
  catch (error) {
    if (error instanceof WorkflowVersionConflict) return json({ error: { code: "VERSION_CONFLICT", message: error.message } }, 409);
    throw error;
  }
}
