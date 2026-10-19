// 客户端收纳后核对源码服务定位，并保留发布包服务布局兼容。
// Created on 2026-10-19
// @author: https://github.com/Linmoqian
use super::{mobile_backend_path, repo_root};

#[test]
fn source_and_packaged_service_layouts() -> Result<(), Box<dyn std::error::Error>> {
    let root = repo_root();
    assert!(root.join("pnpm-workspace.yaml").is_file());
    assert!(root.join("server/package.json").is_file());
    assert!(root.join("gateway/package.json").is_file());
    assert_eq!(mobile_backend_path(&root), root.join("app/mobile/backend"));
    assert!(mobile_backend_path(&root).join("package.json").is_file());

    let packaged = tempfile::tempdir()?;
    let backend = packaged.path().join("yunfeng-mobile-backend");
    std::fs::create_dir(&backend)?;
    std::fs::write(backend.join("package.json"), "{}")?;
    assert_eq!(mobile_backend_path(packaged.path()), backend);
    Ok(())
}
