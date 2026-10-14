//! 本地协作的持久化、边界、幂等性与背压回归。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
use super::{
    model::{self, Action, Link},
    store::Store,
    Runtime,
};
use rusqlite::{params, Connection};

fn store() -> Store {
    Store::initialize(Connection::open_in_memory().unwrap()).unwrap()
}
fn create(store: &mut Store) -> model::Snapshot {
    store
        .action(Action::Create {
            name: "测试团队".into(),
            owner: "工程师".into(),
        })
        .unwrap()
}

#[test]
fn names_and_bodies_are_bounded() {
    assert_eq!(model::name(" 团队 ").unwrap(), "团队");
    for name in [String::new(), "a".repeat(81), "成员\0".into()] {
        assert!(model::name(&name).is_err());
    }
    assert!(model::body("\n正文\n", false).is_ok());
    assert!(model::body(" ", false).is_err());
    assert!(model::body("", true).is_ok());
    assert!(model::body(&"字".repeat(4001), true).is_err());
    assert!(model::body("非法\0", true).is_err());
}
#[test]
fn ipc_rejects_unknown_actions_and_fields() {
    assert!(serde_json::from_str::<Action>(r#"{"action":"pair"}"#).is_err());
    assert!(serde_json::from_str::<Action>(r#"{"action":"snapshot","address":"remote"}"#).is_err());
}
#[test]
fn create_is_idempotent_and_does_not_overwrite_active_team() {
    let mut store = store();
    let first = create(&mut store).team.unwrap();
    let second = create(&mut store).team.unwrap();
    assert_eq!(first.id, second.id);
    assert!(store
        .action(Action::Create {
            name: "其他团队".into(),
            owner: "工程师".into()
        })
        .is_err());
    assert_eq!(store.snapshot().unwrap().team.unwrap().name, "测试团队");
}
#[test]
fn messages_are_idempotent_and_reject_id_reuse() {
    let mut store = store();
    create(&mut store);
    let id = uuid::Uuid::new_v4().to_string();
    for _ in 0..2 {
        store
            .action(Action::Message {
                id: id.clone(),
                text: "你好".into(),
            })
            .unwrap();
    }
    assert_eq!(store.snapshot().unwrap().messages.len(), 1);
    assert!(store
        .action(Action::Message {
            id,
            text: "改写".into()
        })
        .is_err());
    assert_eq!(store.snapshot().unwrap().messages[0].text, "你好");
}
#[test]
fn invalid_board_link_does_not_replace_saved_board() {
    let mut store = store();
    create(&mut store);
    store
        .action(Action::Board {
            announcement: "已保存".into(),
            links: vec![],
        })
        .unwrap();
    for url in [
        "javascript:alert(1)",
        "file:///tmp/file",
        "https://user:password@example.test/",
    ] {
        assert!(store
            .action(Action::Board {
                announcement: "错误".into(),
                links: vec![Link {
                    title: "链接".into(),
                    url: url.into()
                }]
            })
            .is_err());
        assert_eq!(store.snapshot().unwrap().board, "已保存");
    }
    let valid = model::links(vec![Link {
        title: "文档".into(),
        url: "https://example.test".into(),
    }])
    .unwrap();
    assert_eq!(valid[0].url, "https://example.test/");
}
#[test]
fn close_and_restore_preserve_local_records() {
    let mut store = store();
    let id = create(&mut store).team.unwrap().id;
    store
        .action(Action::Message {
            id: uuid::Uuid::new_v4().to_string(),
            text: "保留消息".into(),
        })
        .unwrap();
    let closed = store.action(Action::Leave {}).unwrap();
    assert!(closed.team.is_none());
    assert_eq!(closed.saved_teams.len(), 1);
    assert!(store
        .action(Action::Activate {
            id: uuid::Uuid::new_v4().to_string()
        })
        .is_err());
    let reopened = store.action(Action::Activate { id }).unwrap();
    assert_eq!(reopened.messages[0].text, "保留消息");
    assert!(!reopened.network_available);
}
#[test]
fn snapshot_is_bounded_and_chronological() {
    let mut store = store();
    let team = create(&mut store).team.unwrap().id;
    for sequence in 0..250 {
        store
            .db
            .execute(
                "INSERT INTO messages(id,team_id,text,created_at) VALUES (?1,?2,?3,?4)",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    team,
                    sequence.to_string(),
                    sequence
                ],
            )
            .unwrap();
    }
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.messages.len(), 200);
    assert_eq!(snapshot.messages.first().unwrap().text, "50");
    assert_eq!(snapshot.messages.last().unwrap().text, "249");
}
#[test]
fn database_reopen_keeps_installation_and_team() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("collaboration/store.sqlite3");
    let mut first = Store::open(&path).unwrap();
    let snapshot = create(&mut first);
    first
        .action(Action::Message {
            id: uuid::Uuid::new_v4().to_string(),
            text: "重开后保留".into(),
        })
        .unwrap();
    first
        .action(Action::Board {
            announcement: "持久公告".into(),
            links: vec![],
        })
        .unwrap();
    drop(first);
    let reopened = Store::open(&path).unwrap().snapshot().unwrap();
    assert_eq!(reopened.installation_id, snapshot.installation_id);
    assert_eq!(reopened.team.unwrap().id, snapshot.team.unwrap().id);
    assert_eq!(reopened.messages[0].text, "重开后保留");
    assert_eq!(reopened.board, "持久公告");
}
#[test]
fn future_schema_is_rejected() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("PRAGMA user_version=2;").unwrap();
    assert!(matches!(Store::initialize(db), Err(error) if error.code == "COLLAB_SCHEMA"));
}
#[test]
fn admission_is_bounded_and_recovers_after_drop() {
    let runtime = Runtime::new("unused.sqlite3".into());
    let permit = runtime.admit().unwrap();
    assert!(matches!(runtime.admit(), Err(error) if error.code == "COLLAB_BUSY"));
    drop(permit);
    assert!(runtime.admit().is_ok());
}
#[test]
fn only_main_window_is_authorized() {
    assert!(super::authorize("main").is_ok());
    assert_eq!(
        super::authorize("secondary").unwrap_err().code,
        "COLLAB_FORBIDDEN"
    );
}
