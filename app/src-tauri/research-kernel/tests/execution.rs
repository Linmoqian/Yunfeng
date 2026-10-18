//! 私有文件执行契约的边界与真实产物回归。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use serde_json::{json, Value};
use yunfeng_research_kernel::execution::{execute, Request};
fn call(value: Value) -> yunfeng_research_kernel::Result<Value> {
    execute(serde_json::from_value::<Request>(value)?)
}
#[test]
fn strict_requests_real_files_and_no_invalid_metric_success() {
    let root = tempfile::tempdir().unwrap();
    let cwd = root.path().to_str().unwrap();
    assert_eq!(
        call(json!({"action":"write","cwd":cwd,"path":"result.json","content":"{\"score\":0.93}"}))
            .unwrap(),
        Value::Null
    );
    assert!(call(json!({"action":"read","cwd":cwd,"path":"result.json","extra":true})).is_err());
    for path in ["../outside", ".env", ""] {
        assert!(call(json!({"action":"write","cwd":cwd,"path":path,"content":"x"})).is_err());
    }
    assert_eq!(
        call(json!({"action":"read","cwd":cwd,"path":"result.json"})).unwrap(),
        "{\"score\":0.93}"
    );
    assert_eq!(call(json!({"action":"evaluate","cwd":cwd,"condition":{"kind":"metric","path":"result.json","key":"score","operator":">=","value":0.9}})).unwrap()["passed"], true);
    assert_eq!(call(json!({"action":"evaluate","cwd":cwd,"condition":{"kind":"metric","path":"result.json","key":"unknown","operator":">=","value":0.9}})).unwrap()["passed"], false);
    assert!(call(json!({"action":"evaluate","cwd":cwd,"condition":{"kind":"file_exists","path":"result.json","key":"extra"}})).is_err());
    std::fs::write(root.path().join("invalid.txt"), [0xff]).unwrap();
    assert!(call(json!({"action":"read","cwd":cwd,"path":"invalid.txt"})).is_err());
    assert!(call(json!({"action":"read","cwd":cwd,"path":"."})).is_err());
}
