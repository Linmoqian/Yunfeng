//! 文稿 SQLite 存储；事务提交成功才更新共享快照。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
use super::model::{error, Error, Snapshot};
use rusqlite::{Connection, OptionalExtension};
use std::path::Path;

pub fn database(path: &Path) -> Result<Connection, Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| failure())?;
    }
    let conn = Connection::open(path).map_err(|_| failure())?;
    conn.busy_timeout(std::time::Duration::from_secs(2))
        .map_err(|_| failure())?;
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|_| failure())?;
    if version > 1 {
        return Err(error("STORAGE_VERSION", "文稿数据库版本较新，请升级应用"));
    }
    conn.execute_batch("CREATE TABLE IF NOT EXISTS manuscript (id INTEGER PRIMARY KEY CHECK(id=1), snapshot TEXT NOT NULL); PRAGMA user_version=1;").map_err(|_| failure())?;
    Ok(conn)
}
pub fn read(path: &Path) -> Result<Option<Snapshot>, Error> {
    let value: Option<String> = database(path)?
        .query_row("SELECT snapshot FROM manuscript WHERE id=1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|_| failure())?;
    value
        .map(|value| {
            serde_json::from_str::<Snapshot>(&value)
                .map_err(|_| failure())
                .and_then(|s| {
                    if s.component != "writing" || s.revision > i64::MAX as u64 {
                        Err(failure())
                    } else {
                        Ok(s)
                    }
                })
        })
        .transpose()
}
pub fn save(path: &Path, snapshot: &Snapshot) -> Result<(), Error> {
    let value = serde_json::to_string(snapshot).map_err(|_| failure())?;
    database(path)?.execute("INSERT INTO manuscript VALUES (1,?1) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot", [value]).map_err(|_| failure())?;
    Ok(())
}
pub fn failure() -> Error {
    error("STORAGE_ERROR", "文稿保存或读取失败，请检查本机存储")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::component_sharing::model::Store;
    use serde_json::json;
    #[test]
    fn restart_restores_unicode_and_revision() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("paper.sqlite3");
        let mut first = Store::persistent(path.clone());
        first
            .patch(
                "writing",
                json!({"name":"中文论文","body":"# 研究\n\n正文"})
                    .as_object()
                    .unwrap()
                    .clone(),
            )
            .unwrap();
        let mut second = Store::persistent(path);
        let restored = second.get("writing").unwrap();
        assert_eq!(restored.revision, 1);
        assert_eq!(restored.state["body"], "# 研究\n\n正文");
        assert!(second
            .patch("writing", json!({"body":42}).as_object().unwrap().clone())
            .is_err());
        assert_eq!(second.get("writing").unwrap().revision, 1);
    }
    #[test]
    fn future_schema_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("future.sqlite3");
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "user_version", 9).unwrap();
        assert_eq!(database(&path).unwrap_err().code, "STORAGE_VERSION");
        assert_eq!(
            conn.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
                .unwrap(),
            9
        );
    }
}
