//! 私有通道认证、会话隔离与真实 PTY 回归。
//! Created on 2026-10-16
//! @author: https://github.com/Linmoqian
use super::*;
use std::time::Instant;
fn call(bridge: &AgentBridge, token: &str, request: Value) -> Value {
    let mut stream = TcpStream::connect(bridge.address).unwrap();
    serde_json::to_writer(&mut stream, &json!({ "token": token, "request": request })).unwrap();
    stream.write_all(b"\n").unwrap();
    let mut line = String::new();
    BufReader::new(stream).read_line(&mut line).unwrap();
    serde_json::from_str(&line).unwrap()
}
#[test]
fn authenticated_command_shares_output_exit_and_recycles_only_released_sessions() {
    let runtime = Runtime::default();
    let manual = runtime
        .action(Request::Start {
            size: super::super::model::Size { cols: 80, rows: 24 },
        })
        .unwrap();
    let bridge = AgentBridge::start(runtime.clone()).unwrap();
    let cwd = std::env::temp_dir();
    let start =
        json!({ "action": "start", "cwd": cwd, "command": "printf 'YF_RUST_云枫\\n'; exit 7" });
    assert_eq!(
        call(&bridge, "wrong", start.clone())["error"]["code"],
        "FORBIDDEN"
    );
    assert_eq!(
        call(
            &bridge,
            &bridge.token,
            json!({ "action": "stop", "id": manual["id"] })
        )["error"]["code"],
        "FORBIDDEN"
    );
    for _ in 0..6 {
        let result = call(&bridge, &bridge.token, start.clone());
        let id = result["result"]["id"].as_str().unwrap().to_owned();
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut cursor = 0;
        let mut bytes = Vec::new();
        loop {
            assert!(Instant::now() < deadline);
            let result = call(
                &bridge,
                &bridge.token,
                json!({ "action": "read", "id": id, "cursor": cursor }),
            );
            let chunk = &result["result"];
            bytes.extend(
                chunk["data"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_u64().unwrap() as u8),
            );
            cursor = chunk["cursor"].as_u64().unwrap();
            if chunk["closed"] == true && !chunk["exitCode"].is_null() {
                assert_eq!(chunk["exitCode"], 7);
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(String::from_utf8(bytes).unwrap().contains("YF_RUST_云枫"));
        let ui = runtime.get(&id).unwrap().read(0).unwrap();
        assert!(ui.agent);
        assert!(String::from_utf8(ui.data).unwrap().contains("YF_RUST_云枫"));
        assert!(call(
            &bridge,
            &bridge.token,
            json!({ "action": "release", "id": id })
        )["error"]
            .is_null());
    }
    assert!(runtime.get(manual["id"].as_str().unwrap()).is_ok());
    runtime.stop_all();
}
#[test]
fn stop_running_command_and_release() {
    let runtime = Runtime::default();
    let bridge = AgentBridge::start(runtime.clone()).unwrap();
    let started = call(
        &bridge,
        &bridge.token,
        json!({ "action": "start", "cwd": std::env::temp_dir(), "command": "sleep 30" }),
    );
    let id = &started["result"]["id"];
    assert_eq!(
        call(
            &bridge,
            &bridge.token,
            json!({ "action": "release", "id": id })
        )["error"]["code"],
        "BUSY"
    );
    assert!(call(
        &bridge,
        &bridge.token,
        json!({ "action": "stop", "id": id })
    )["error"]
        .is_null());
    assert!(call(
        &bridge,
        &bridge.token,
        json!({ "action": "release", "id": id })
    )["error"]
        .is_null());
    runtime.stop_all();
}

#[test]
fn stop_reaps_background_child_after_shell_exit() {
    let session = super::super::session::Session::command(
        std::env::temp_dir().to_str().unwrap(),
        "sleep 30 & exit 0",
    )
    .unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    while session.read(0).unwrap().exit_code.is_none() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(20));
    }
    session.stop().unwrap();
}
