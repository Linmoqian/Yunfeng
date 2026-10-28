// 看板工作流的持久化与乐观版本检查。
// Created on 2026-10-28
// @author: https://github.com/Linmoqian

import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class WorkflowVersionConflict extends Error {}

export class WorkflowStore {
  private readonly file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "taskboard.sqlite");
    const db = this.open();
    try {
      db.exec("CREATE TABLE IF NOT EXISTS workflows (project_id TEXT PRIMARY KEY, workspace TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)");
      chmodSync(this.file, 0o600);
    } finally { db.close(); }
  }

  private open(): DatabaseSync {
    const db = new DatabaseSync(this.file);
    db.exec("PRAGMA busy_timeout=1000");
    return db;
  }

  read(projectId: string) {
    const db = this.open();
    try {
      const row = db.prepare("SELECT workspace, version, updated_at FROM workflows WHERE project_id = ?").get(projectId);
      return row
        ? { projectId, workspace: JSON.parse(String(row.workspace)), version: Number(row.version), updatedAt: String(row.updated_at) }
        : { projectId, workspace: null, version: 0, updatedAt: null };
    } finally { db.close(); }
  }

  save(projectId: string, workspace: object, version: number) {
    const db = this.open();
    try {
      db.exec("BEGIN IMMEDIATE");
      const current = db.prepare("SELECT version FROM workflows WHERE project_id = ?").get(projectId);
      if (Number(current?.version ?? 0) !== version) throw new WorkflowVersionConflict("工作流已被其他窗口修改");
      const updatedAt = new Date().toISOString();
      db.prepare("INSERT INTO workflows VALUES (?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET workspace=excluded.workspace, version=excluded.version, updated_at=excluded.updated_at")
        .run(projectId, JSON.stringify(workspace), version + 1, updatedAt);
      db.exec("COMMIT");
      return { projectId, workspace, version: version + 1, updatedAt };
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* 事务未开始时无需回滚。 */ }
      throw error;
    } finally { db.close(); }
  }
}
