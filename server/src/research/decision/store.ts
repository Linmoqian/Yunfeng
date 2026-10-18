/* 科研检查点与节点关系在同一 SQLite 事务保存；JSON 旧文件仅作迁移备份。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import type { TaskState } from "../../task/types.js";
import { validateRelations } from "./relations.js";
export class ResearchGraphStore {
  private readonly file: string;
  constructor(dataDir: string) {
    this.file = join(dataDir, "research.sqlite");
    const db = this.open();
    try {
      const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
      if (version > 1) throw new Error("科研数据库版本较新，请使用兼容服务");
      db.exec(`CREATE TABLE IF NOT EXISTS research_task (id TEXT PRIMARY KEY, checkpoint TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS research_node (
          task_id TEXT NOT NULL REFERENCES research_task(id), id TEXT NOT NULL, parent TEXT, ordinal INTEGER NOT NULL, payload TEXT NOT NULL,
          PRIMARY KEY(task_id,id), FOREIGN KEY(task_id,parent) REFERENCES research_node(task_id,id) DEFERRABLE INITIALLY DEFERRED
        ); CREATE INDEX IF NOT EXISTS research_node_parent ON research_node(task_id,parent); PRAGMA user_version=1;`);
      chmodSync(this.file, 0o600);
    } finally { db.close(); }
  }
  private open() {
    const db = new DatabaseSync(this.file);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;");
    return db;
  }
  readAll(): TaskState[] {
    const db = this.open();
    try {
      db.exec("BEGIN");
      const tasks = db.prepare("SELECT id,checkpoint FROM research_task").all().map((row) => {
        const task = JSON.parse(String(row.checkpoint)) as TaskState;
        if (task.autonomy?.decision) task.autonomy.decision.nodes = db.prepare("SELECT id,parent,payload FROM research_node WHERE task_id=? AND id!='mission' ORDER BY ordinal").all(String(row.id))
          .map((node) => ({ ...JSON.parse(String(node.payload)), id: String(node.id), parent: String(node.parent) }));
        return task;
      });
      db.exec("COMMIT");
      return tasks;
    } finally { db.close(); }
  }
  save(task: TaskState): void {
    const tree = task.autonomy?.decision;
    if (tree) validateRelations(tree);
    // 节点单独序列化，避免复制一遍完整实验报告与目标树。
    const checkpoint = { ...task, ...(task.autonomy ? { autonomy: { ...task.autonomy, ...(tree ? { decision: { ...tree, nodes: [] } } : {}) } } : {}) };
    const db = this.open();
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare("INSERT INTO research_task(id,checkpoint) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET checkpoint=excluded.checkpoint").run(task.id, JSON.stringify(checkpoint));
      if (tree) {
        const ids = ["mission", ...tree.nodes.map((node) => node.id)];
        db.prepare(`DELETE FROM research_node WHERE task_id=? AND id NOT IN (${ids.map(() => "?").join(",")})`).run(task.id, ...ids);
        const insert = db.prepare(`INSERT INTO research_node(task_id,id,parent,ordinal,payload) VALUES (?,?,?,?,?)
          ON CONFLICT(task_id,id) DO UPDATE SET parent=excluded.parent,ordinal=excluded.ordinal,payload=excluded.payload
          WHERE parent IS NOT excluded.parent OR ordinal!=excluded.ordinal OR payload!=excluded.payload`);
        insert.run(task.id, "mission", null, -1, "{}");
        tree.nodes.forEach(({ id, parent, ...payload }, ordinal) => insert.run(task.id, id, parent, ordinal, JSON.stringify(payload)));
      } else db.prepare("DELETE FROM research_node WHERE task_id=?").run(task.id);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch { /* BEGIN 未成功时无需回滚。 */ } throw error; }
    finally { db.close(); }
  }
  /** 事件游标无需复制或重写节点；仍同步提交后才允许向订阅者分发。 */
  saveEventSequence(id: string, seq: number, updatedAt: string): void {
    const db = this.open();
    try {
      const result = db.prepare("UPDATE research_task SET checkpoint=json_set(checkpoint,'$.lastEventSeq',?,'$.updatedAt',?) WHERE id=?").run(seq, updatedAt, id);
      if (Number(result.changes) !== 1) throw new Error("科研检查点不存在");
    } finally { db.close(); }
  }
}
