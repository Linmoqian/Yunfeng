//! 真实桌面私有通道认证及 TS 编排/Rust 执行交叉验收。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use super::*;
use std::path::Path;
fn call(bridge: &AgentBridge, token: &str, request: Value) -> Value {
    let mut stream = TcpStream::connect(bridge.address).unwrap();
    serde_json::to_writer(&mut stream, &json!({"token":token,"request":request})).unwrap();
    stream.write_all(b"\n").unwrap();
    let mut line = String::new();
    BufReader::new(stream).read_line(&mut line).unwrap();
    serde_json::from_str(&line).unwrap()
}
#[test]
fn research_files_require_auth_and_reject_sensitive_paths() {
    let root = tempfile::tempdir().unwrap();
    let bridge = AgentBridge::start(Runtime::default(), None).unwrap();
    let request = json!({"action":"research","request":{"action":"write","cwd":root.path(),"path":"result.json","content":"{\"mean\":4}"}});
    assert_eq!(
        call(&bridge, "wrong", request.clone())["error"]["code"],
        "FORBIDDEN"
    );
    assert!(!root.path().join("result.json").exists());
    assert_eq!(call(&bridge, &bridge.token, request)["result"], Value::Null);
    assert_eq!(
        std::fs::read_to_string(root.path().join("result.json")).unwrap(),
        "{\"mean\":4}"
    );
    let rejected = call(
        &bridge,
        &bridge.token,
        json!({"action":"research","request":{"action":"read","cwd":root.path(),"path":".env"}}),
    );
    assert_eq!(rejected["error"]["code"], "RESEARCH_IO_FAILED");
    assert!(!rejected.to_string().contains(root.path().to_str().unwrap()));
}
#[test]
#[ignore = "requires server build and Node; run explicitly for cross-stack acceptance"]
fn hybrid_typescript_orchestration_uses_real_rust_bridge() {
    let root = tempfile::tempdir().unwrap();
    let bridge = AgentBridge::start(Runtime::default(), None).unwrap();
    let script = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../server/scripts/research-live/hybrid-check.mjs");
    let mut command = std::process::Command::new("node");
    command.arg(script).arg(root.path());
    bridge.configure(&mut command);
    let output = command.output().unwrap();
    assert!(
        output.status.success(),
        "stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(String::from_utf8_lossy(&output.stdout).contains("hybrid-research-passed"));
    print!("{}", String::from_utf8_lossy(&output.stdout));
}

#[test]
#[ignore = "requires server build, Rust release worker and Node/tsx; run explicitly"]
fn hybrid_workflow_three_round_comparison() {
    let root = tempfile::tempdir().unwrap();
    let output_path = std::env::var_os("YUNFENG_ACCEPTANCE_OUTPUT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| root.path().join("comparison"));
    let bridge = AgentBridge::start(Runtime::default(), None).unwrap();
    let server = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../server");
    let mut command = std::process::Command::new("node");
    command
        .current_dir(server)
        .args([
            "--import",
            "tsx",
            "scripts/research-live/workflow-compare.ts",
        ])
        .arg(&output_path)
        .arg("--hybrid");
    bridge.configure(&mut command);
    command.env(
        "YUNFENG_ACCEPTANCE_RUST_PROFILE",
        if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
    );
    command.env(
        "YUNFENG_ACCEPTANCE_RUST_HOST",
        std::env::current_exe().unwrap(),
    );
    let output = command.output().unwrap();
    assert!(
        output.status.success(),
        "stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let report: Value = serde_json::from_slice(
        &std::fs::read(output_path.join("workflow-comparison.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(report["rounds"], 3);
    assert_eq!(report["hybrid"], true);
    assert_eq!(report["runs"].as_array().unwrap().len(), 15);
    print!("{}", String::from_utf8_lossy(&output.stdout));
}
