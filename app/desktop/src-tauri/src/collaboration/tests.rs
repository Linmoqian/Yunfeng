//! 桌面协作的授权与背压边界；领域回归在独立 crate 维护。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use super::Runtime;
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

#[test]
fn desktop_binding_restores_routes_and_disconnects_without_copying_data() {
    use super::{backend::Backend, Input};
    use serde_json::{json, Value};
    use std::time::{Duration, Instant};
    use yunfeng_team::node::{client, serve};
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("node");
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let socket = listener.local_addr().unwrap();
    drop(listener);
    let address = format!("http://{socket}");
    let node_dir = directory.clone();
    let worker = std::thread::spawn(move || serve(&node_dir, "测试节点", socket));
    let deadline = Instant::now() + Duration::from_secs(5);
    while !directory.join("control.token").exists() {
        assert!(Instant::now() < deadline, "节点未启动");
        std::thread::sleep(Duration::from_millis(10));
    }
    let token = std::fs::read_to_string(directory.join("control.token")).unwrap();
    struct Stop(String, String);
    impl Drop for Stop {
        fn drop(&mut self) {
            let _ = client::request(&self.0, &self.1, &json!({"action":"shutdown"}));
        }
    }
    let stop = Stop(address.clone(), token.clone());
    client::request(
        &address,
        &token,
        &json!({"action":"create","name":"节点团队"}),
    )
    .unwrap();
    let path = root.path().join("desktop/store.sqlite3");
    let apply = |backend: &mut Backend, value: Value| {
        backend.apply(serde_json::from_value::<Input>(value).unwrap(), &path)
    };
    let mut backend = Backend::default();
    let local = apply(
        &mut backend,
        json!({"action":"create","name":"原有本地团队","owner":"工程师"}),
    )
    .unwrap();
    let connected = apply(
        &mut backend,
        json!({"action":"nodeConnect","address":address,"directory":directory}),
    )
    .unwrap();
    assert_eq!(connected["team"]["name"], "节点团队");
    assert!(connected.get("connection").is_some());
    assert!(!connected.to_string().contains(&token));
    assert!(apply(&mut backend, json!({"action":"leave"})).is_err());
    drop(backend);
    let mut restored = Backend::default();
    assert_eq!(
        apply(&mut restored, json!({"action":"nodeRefresh"})).unwrap()["connection"],
        connected["connection"]
    );
    apply(
        &mut restored,
        json!({"action":"board","announcement":"节点公告","links":[]}),
    )
    .unwrap();
    assert_eq!(
        client::request(&address, &token, &json!({"action":"snapshot"})).unwrap()["snapshot"]
            ["board"],
        "节点公告"
    );
    let disconnected = apply(&mut restored, json!({"action":"nodeDisconnect"})).unwrap();
    assert_eq!(disconnected, local);
    assert!(!path.with_file_name("node-connection.json").exists());
    assert!(
        client::request(&address, &"0".repeat(64), &json!({"action":"snapshot"}))
            .is_err_and(|e| e.code == "NODE_FORBIDDEN")
    );
    assert!(serde_json::from_value::<Input>(
        json!({"action":"nodeConnect","address":address,"token":"forbidden"})
    )
    .is_err());
    drop(stop);
    worker.join().unwrap().unwrap();
}
