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

#[test]
fn bounded_batches_preserve_read_order_prevalidate_and_do_not_hide_partial_writes() {
    let root = tempfile::tempdir().unwrap();
    let cwd = root.path().to_str().unwrap();
    let condition =
        json!({"kind":"metric","path":"two.json","key":"value","operator":"==","value":2});
    let files =
        json!([{"path":"one.json","content":"{}"},{"path":"two.json","content":"{\"value\":2}"}]);
    assert_eq!(
        call(json!({"action":"write_many","cwd":cwd,"files":files,"condition":condition})).unwrap()
            ["evaluation"]["passed"],
        true
    );
    let read = call(json!({"action":"read_many","cwd":cwd,"paths":["two.json","missing.json",".env","one.json"]})).unwrap();
    assert_eq!(read[0]["content"], "{\"value\":2}");
    assert_eq!(read[1]["error"], "观察文件不可用");
    assert_eq!(read[2]["error"], "观察文件不可用");
    assert_eq!(read[3]["content"], "{}");
    for paths in [vec![], vec!["one.json"; 9]] {
        assert!(call(json!({"action":"read_many","cwd":cwd,"paths":paths})).is_err());
    }
    let invalid = json!([{"path":"untouched.json","content":"ok"},{"path":".env","content":"bad"}]);
    assert!(call(json!({"action":"write_many","cwd":cwd,"files":invalid})).is_err());
    assert!(!root.path().join("untouched.json").exists());
    let invalid_condition = json!({"kind":"file_exists","path":"../outside"});
    assert!(call(json!({"action":"write_many","cwd":cwd,"files":[{"path":"untouched.json","content":"ok"}],"condition":invalid_condition})).is_err());
    assert!(!root.path().join("untouched.json").exists());
    assert!(call(json!({"action":"write_many","cwd":cwd,"files":vec![json!({"path":"over.json","content":"x"});9]})).is_err());
    assert!(call(json!({"action":"write_many","cwd":cwd,"files":[{"path":"too-big","content":"x".repeat(65537)}]})).is_err());
    std::fs::create_dir(root.path().join("directory")).unwrap();
    let partial = json!([{"path":"committed.json","content":"first"},{"path":"directory","content":"second"},{"path":"never.json","content":"third"}]);
    assert!(call(json!({"action":"write_many","cwd":cwd,"files":partial})).is_err());
    assert_eq!(
        std::fs::read_to_string(root.path().join("committed.json")).unwrap(),
        "first"
    );
    assert!(!root.path().join("never.json").exists());
}

#[test]
fn range_reads_and_unique_patch_preserve_bytes_and_reject_conflicts() {
    let root = tempfile::tempdir().unwrap();
    let cwd = root.path().to_str().unwrap();
    let file = root.path().join("sample.txt");
    std::fs::write(&file, "一\r\nsecond\n末行").unwrap();
    let range = call(
        json!({"action":"read_range","cwd":cwd,"path":"sample.txt","start_line":2,"line_count":1}),
    )
    .unwrap();
    assert_eq!(range["content"], "second\n");
    assert_eq!(range["total_lines"], 3);
    assert_eq!(range["truncated"], true);
    let patch = json!({"action":"patch","cwd":cwd,"path":"sample.txt","old_text":"second","new_text":"替换"});
    assert_eq!(call(patch.clone()).unwrap()["changed"], true);
    assert_eq!(std::fs::read_to_string(&file).unwrap(), "一\r\n替换\n末行");
    assert!(call(patch).is_err());
    std::fs::write(&file, "aaa").unwrap();
    assert!(call(
        json!({"action":"patch","cwd":cwd,"path":"sample.txt","old_text":"aa","new_text":"b"})
    )
    .is_err());
    assert_eq!(std::fs::read_to_string(&file).unwrap(), "aaa");
    for path in ["../outside", ".env", "."] {
        assert!(call(
            json!({"action":"patch","cwd":cwd,"path":path,"old_text":"a","new_text":"b"})
        )
        .is_err());
    }
    assert!(call(
        json!({"action":"read_range","cwd":cwd,"path":"sample.txt","start_line":0,"line_count":1})
    )
    .is_err());
    assert!(call(json!({"action":"read_range","cwd":cwd,"path":"sample.txt","start_line":1,"line_count":1001})).is_err());
}
