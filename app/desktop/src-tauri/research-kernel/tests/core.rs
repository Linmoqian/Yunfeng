//! 核心边界：真实读写、数值验收、关系事务、增量更新和跨连接恢复。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use rusqlite::Connection;
use serde_json::json;
use std::fs;
use yunfeng_research_kernel::{files, store::GraphStore};

#[test]
fn bounded_files_and_real_numeric_acceptance() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    files::write_text(
        root,
        ".lin/experiments/report.json",
        r#"{"accuracy":0.93,"completed":1,"string":"1","boolean":true}"#,
    )
    .unwrap();
    let condition = json!({"kind":"metric","path":".lin/experiments/report.json","key":"completed","operator":"==","value":1});
    assert_eq!(files::evaluate(root, &condition).unwrap()["passed"], true);
    for key in ["string", "boolean", "missing"] {
        let mut invalid = condition.clone();
        invalid["key"] = key.into();
        assert!(files::evaluate(root, &invalid).is_err());
    }
    for path in [
        "../escape",
        ".env",
        ".env.local",
        ".git/config",
        "nested/auth.json",
        "/outside",
        "",
        "credentials.json",
        "key.pem",
    ] {
        assert!(files::write_text(root, path, "private").is_err(), "{path}");
    }
    files::write_text(root, "exact.txt", &"x".repeat(65536)).unwrap();
    assert_eq!(files::read_text(root, "exact.txt").unwrap().len(), 65536);
    assert!(files::write_text(root, "large.txt", &"x".repeat(65537)).is_err());
    fs::write(root.join("large.txt"), "x".repeat(65537)).unwrap();
    assert!(files::read_text(root, "large.txt").is_err());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(root.join("exact.txt"), root.join("link")).unwrap();
        assert!(files::read_text(root, "link").is_err());
        assert!(files::write_text(root, "link", "bad").is_err());
    }
    assert!(!fs::read_dir(root).unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .ends_with(".tmp")));
}

#[test]
fn incremental_relations_commit_or_rollback_and_restore_cursor() {
    let dir = tempfile::tempdir().unwrap();
    let store = GraphStore::new(dir.path()).unwrap();
    let mut task = json!({"id":"test","lastEventSeq":0,"updatedAt":"initial","autonomy":{"reason":"start","decision":{"nodes":[
        {"id":"group","parent":"mission","kind":"group"},
        {"id":"experiment","parent":"group","kind":"execute","attempts":1,"result":{"actual":0.93}}
    ]}}});
    store.save(&task).unwrap();
    assert_eq!(store.read("test").unwrap(), task);
    let db = Connection::open(dir.path().join("research.sqlite")).unwrap();
    db.execute_batch("CREATE TABLE writes(kind TEXT); CREATE TRIGGER track_update AFTER UPDATE ON research_node BEGIN INSERT INTO writes VALUES('update'); END;
    CREATE TRIGGER track_delete AFTER DELETE ON research_node BEGIN INSERT INTO writes VALUES('delete'); END;").unwrap();
    task["autonomy"]["reason"] = "changed".into();
    store.save(&task).unwrap();
    store.save_cursor("test", 7, "new").unwrap();
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM writes", [], |row| row
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    let restored = GraphStore::new(dir.path()).unwrap().read("test").unwrap();
    assert_eq!(restored["lastEventSeq"], 7);
    assert_eq!(
        restored["autonomy"]["decision"]["nodes"][1]["result"]["actual"],
        0.93
    );
    let mut invalid = restored.clone();
    invalid["autonomy"]["decision"]["nodes"][0]["parent"] = "experiment".into();
    assert!(store.save(&invalid).is_err());
    assert_eq!(store.read("test").unwrap(), restored);
    let mut malformed = restored.clone();
    malformed["autonomy"]["decision"]["nodes"] = json!({});
    assert!(store.save(&malformed).is_err());
    assert_eq!(store.read("test").unwrap(), restored);
    db.execute_batch("CREATE TRIGGER reject_node BEFORE UPDATE ON research_node BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
    let mut failed = restored.clone();
    failed["autonomy"]["reason"] = "must rollback".into();
    failed["autonomy"]["decision"]["nodes"][1]["attempts"] = 2.into();
    assert!(store.save(&failed).is_err());
    assert_eq!(store.read("test").unwrap(), restored);
    db.execute_batch("DROP TRIGGER reject_node").unwrap();
    failed["autonomy"]["decision"]["nodes"][1]["parent"] = "mission".into();
    failed["autonomy"]["decision"]["nodes"]
        .as_array_mut()
        .unwrap()
        .remove(0);
    store.save(&failed).unwrap();
    assert_eq!(store.read("test").unwrap(), failed);
    assert!(store.save_cursor("missing", 1, "ignored").is_err());
    assert!(store.save_cursor("test", u64::MAX, "ignored").is_err());
}
