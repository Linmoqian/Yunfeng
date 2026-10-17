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
