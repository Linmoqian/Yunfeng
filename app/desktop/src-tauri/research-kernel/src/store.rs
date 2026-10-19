//! 与现有 research.sqlite v1 同构的增量节点存储；仅供隔离对照，未接管生产数据库。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use super::checkpoint::Checkpoint;
use crate::Result;
use rusqlite::{params, params_from_iter, Connection};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

pub struct GraphStore {
    file: PathBuf,
}
fn validate(nodes: &[Value]) -> Result<()> {
    let mut ids = HashMap::new();
    for node in nodes {
        let id = node["id"].as_str().ok_or("缺少节点身份")?;
        if id == "mission" || ids.insert(id, node).is_some() {
            return Err("节点身份无效".into());
        }
    }
    if ids.len() > 100 {
        return Err("节点超过上限".into());
    }
    for node in nodes {
        let mut seen = HashSet::from([node["id"].as_str().ok_or("缺少节点身份")?]);
        let mut parent = node["parent"].as_str().ok_or("缺少父节点")?;
        while parent != "mission" {
            if seen.contains(parent) || seen.len() >= 4 {
                return Err("循环或超过四层".into());
            }
            seen.insert(parent);
            let group = ids.get(parent).ok_or("父节点不存在")?;
            if group["kind"] != "group" {
                return Err("父节点不是分组".into());
            }
            parent = group["parent"].as_str().ok_or("缺少父节点")?;
        }
    }
    Ok(())
}
impl GraphStore {
    /// 使用现有版本的表结构和默认 SQLite 提交方式，未知新版数据库拒绝打开。
    pub fn new(directory: &Path) -> Result<Self> {
        std::fs::create_dir_all(directory)?;
        let store = Self {
            file: directory.join("research.sqlite"),
        };
        let db = store.open()?;
        let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 1 {
            return Err("科研数据库版本较新".into());
        }
        db.execute_batch("CREATE TABLE IF NOT EXISTS research_task (id TEXT PRIMARY KEY, checkpoint TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS research_node (task_id TEXT NOT NULL REFERENCES research_task(id), id TEXT NOT NULL, parent TEXT, ordinal INTEGER NOT NULL, payload TEXT NOT NULL,
          PRIMARY KEY(task_id,id), FOREIGN KEY(task_id,parent) REFERENCES research_node(task_id,id) DEFERRABLE INITIALLY DEFERRED);
          CREATE INDEX IF NOT EXISTS research_node_parent ON research_node(task_id,parent); PRAGMA user_version=1;")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&store.file, std::fs::Permissions::from_mode(0o600))?;
        }
        Ok(store)
    }
    fn open(&self) -> Result<Connection> {
        let db = Connection::open(&self.file)?;
        db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;")?;
        Ok(db)
    }
    /// 同一事务保存检查点和关系，任一失败回滚；不修改传入对象。
    pub fn save(&self, task: &Value) -> Result<()> {
        let id = task["id"].as_str().ok_or("缺少任务身份")?;
        let nodes = match task
            .pointer("/autonomy/decision")
            .filter(|tree| !tree.is_null())
        {
            Some(tree) => Some(
                tree.get("nodes")
                    .and_then(Value::as_array)
                    .ok_or("目标树缺少节点列表")?,
            ),
            None => None,
        };
        if let Some(nodes) = nodes {
            validate(nodes)?;
        }
        let checkpoint = serde_json::to_string(&Checkpoint(task, 0))?;
        let mut db = self.open()?;
        let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        tx.execute("INSERT INTO research_task VALUES (?,?) ON CONFLICT(id) DO UPDATE SET checkpoint=excluded.checkpoint", params![id, checkpoint])?;
        if let Some(nodes) = nodes {
            let mut ids = vec![id, "mission"];
            for node in nodes {
                ids.push(node["id"].as_str().ok_or("缺少节点身份")?);
            }
            let marks = vec!["?"; ids.len() - 1].join(",");
            tx.execute(
                &format!("DELETE FROM research_node WHERE task_id=? AND id NOT IN ({marks})"),
                params_from_iter(ids),
            )?;
            let mut insert = tx.prepare("INSERT INTO research_node VALUES (?,?,?,?,?) ON CONFLICT(task_id,id) DO UPDATE SET parent=excluded.parent,ordinal=excluded.ordinal,payload=excluded.payload WHERE parent IS NOT excluded.parent OR ordinal!=excluded.ordinal OR payload!=excluded.payload")?;
            insert.execute(params![id, "mission", Option::<String>::None, -1, "{}"])?;
            for (ordinal, node) in nodes.iter().enumerate() {
                let mut payload = node.clone();
                payload.as_object_mut().ok_or("节点不是对象")?.remove("id");
                payload
                    .as_object_mut()
                    .ok_or("节点不是对象")?
                    .remove("parent");
                insert.execute(params![
                    id,
                    node["id"].as_str(),
                    node["parent"].as_str(),
                    ordinal as i64,
                    payload.to_string()
                ])?;
            }
        } else {
            tx.execute("DELETE FROM research_node WHERE task_id=?", [id])?;
        }
        tx.commit()?;
        Ok(())
    }
    /// 只更新事件游标，成功返回后调用方才更新内存并通知订阅者。
    pub fn save_cursor(&self, id: &str, seq: u64, at: &str) -> Result<()> {
        let db = self.open()?;
        if db.execute("UPDATE research_task SET checkpoint=json_set(checkpoint,'$.lastEventSeq',?,'$.updatedAt',?) WHERE id=?", params![i64::try_from(seq)?, at, id])? != 1 { return Err("检查点不存在".into()); }
        Ok(())
    }
    /// 在一致性读事务中恢复检查点与 SQL 关系。
    pub fn read(&self, id: &str) -> Result<Value> {
        let mut db = self.open()?;
        let tx = db.transaction()?;
        let raw: String = tx.query_row(
            "SELECT checkpoint FROM research_task WHERE id=?",
            [id],
            |row| row.get(0),
        )?;
        let mut task: Value = serde_json::from_str(&raw)?;
        if task.pointer("/autonomy/decision").is_some() {
            let mut query = tx.prepare("SELECT id,parent,payload FROM research_node WHERE task_id=? AND id!='mission' ORDER BY ordinal")?;
            let mut rows = query.query([id])?;
            let mut nodes = vec![];
            while let Some(row) = rows.next()? {
                let mut node: Value = serde_json::from_str(&row.get::<_, String>(2)?)?;
                node["id"] = row.get::<_, String>(0)?.into();
                node["parent"] = row.get::<_, String>(1)?.into();
                nodes.push(node);
            }
            task["autonomy"]["decision"]["nodes"] = nodes.into();
        }
        tx.commit()?;
        Ok(task)
    }
}
