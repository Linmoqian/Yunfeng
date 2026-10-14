# 工作台组件共享

`model.rs` 管理 Rust 进程内的文稿、资源状态及版本；`mod.rs` 提供读取、字段合并与独立窗口 IPC。
文稿标题、正文与版本由 `persistence.rs` 保存到 SQLite；重启恢复最近成功提交。资源清单仅保留至应用退出。子窗口仅访问所属组件，不具备服务和团队权限。
接口契约见 `docs/api/2026-10-14-component-sharing.md`。
