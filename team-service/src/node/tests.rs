//! 节点核心边界：整批回滚、确定性收敛及控制/对等权限隔离。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::*;
fn node(directory: &Path) -> Node {
    Node::open(
        &directory.join("store.sqlite3"),
        "节点",
        "http://127.0.0.1:19001",
    )
    .unwrap()
}
fn command(node: &mut Node, value: Value) -> Value {
    node.handle("/v1/local", &node.control.clone(), value)
        .unwrap()
}
#[test]
fn rejected_batch_rolls_back_business_views_and_log() {
    let dir = tempfile::tempdir().unwrap();
    let mut node = node(dir.path());
    command(&mut node, json!({"action":"create","name":"团队"}));
    let team = node.team().unwrap();
    let mut events = vec![Event {
        id: uuid::Uuid::new_v4().to_string(),
        origin: node.identity.id.clone(),
        clock: 2,
        team: team.clone(),
        change: Mutation::Message {
            name: "节点".into(),
            text: "不能部分提交".into(),
            time: 1,
        },
    }];
    events.push(Event {
        id: uuid::Uuid::new_v4().to_string(),
        origin: node.identity.id.clone(),
        clock: 3,
        team: team.clone(),
        change: Mutation::File {
            name: "file".into(),
            data: "eA==".into(),
            sha256: "forged".into(),
            size: 1,
        },
    });
    assert!(log::merge(&mut node.store, &team, &events).is_err());
    assert!(node.store.snapshot().unwrap().messages.is_empty());
    assert_eq!(log::events(&node.store, &team).unwrap().len(), 1);
    events.truncate(1);
    log::merge(&mut node.store, &team, &events).unwrap();
    log::merge(&mut node.store, &team, &events).unwrap();
    assert_eq!(node.store.snapshot().unwrap().messages.len(), 1);
    events[0].clock += 1;
    assert_eq!(
        log::merge(&mut node.store, &team, &events)
            .unwrap_err()
            .code,
        "NODE_CONFLICT"
    );
    let mut foreign = events[0].clone();
    foreign.team = uuid::Uuid::new_v4().to_string();
    assert!(log::merge(&mut node.store, &team, &[foreign]).is_err());
}
#[test]
fn board_converges_by_logical_order_and_control_is_not_a_peer_capability() {
    let dir = tempfile::tempdir().unwrap();
    let mut node = node(dir.path());
    command(&mut node, json!({"action":"create","name":"团队"}));
    let team = node.team().unwrap();
    let mut a = Event {
        id: uuid::Uuid::new_v4().to_string(),
        origin: node.identity.id.clone(),
        clock: 10,
        team: team.clone(),
        change: Mutation::Board {
            announcement: "新公告".into(),
            links: vec![],
        },
    };
    log::merge(&mut node.store, &team, &[a.clone()]).unwrap();
    a.id = uuid::Uuid::new_v4().to_string();
    a.clock = 2;
    a.change = Mutation::Board {
        announcement: "迟到旧公告".into(),
        links: vec![],
    };
    log::merge(&mut node.store, &team, &[a]).unwrap();
    assert_eq!(node.store.snapshot().unwrap().board, "新公告");
    let invitation = command(&mut node, json!({"action":"invite"}));
    assert_eq!(
        node.handle(
            "/v1/local",
            invitation["ticket"].as_str().unwrap(),
            json!({"action":"snapshot"})
        )
        .unwrap_err()
        .code,
        "NODE_FORBIDDEN"
    );
    assert!(node
        .handle(
            "/v1/exchange",
            &node.control.clone(),
            json!({"from":node.identity.id,"team":team,"events":[]})
        )
        .is_err());
    for address in [
        "http://0.0.0.0:9000",
        "http://example.com",
        "https://127.0.0.1",
        "http://127.0.0.1:9000?token=secret",
    ] {
        assert!(types::address(address).is_err());
    }
    drop(node);
    let reopened = Node::open(
        &dir.path().join("store.sqlite3"),
        "节点",
        "http://127.0.0.1:19001",
    )
    .unwrap();
    assert_eq!(reopened.store.snapshot().unwrap().board, "新公告");
}
