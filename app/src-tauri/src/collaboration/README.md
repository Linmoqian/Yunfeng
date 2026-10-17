# 桌面协作适配

领域模型、输入校验、SQLite 存储和核心测试由独立 [team-service](../../../../team-service/README.md) crate 维护；本目录只保留 Tauri command、main 窗口授权、单操作背压与 `spawn_blocking` 适配。

现有 `collaboration_action` 请求与响应保持兼容，数据库仍在应用数据目录的 `collaboration/store.sqlite3`。首次打开将 v1 事务升级至 v2，增加可空消息作者字段，保留团队、公告、链接和历史消息。安装 UUID 不构成网络认证凭据。

独立 crate 的可选 node feature 可启动多个回环 HTTP 节点验证显式配对、事件交换和文件共享；桌面默认关闭该 feature，尚未连接独立节点网络。运行 `cargo test collaboration` 检查桌面边界，独立核心运行 `cargo test --manifest-path ../../team-service/Cargo.toml --features node`。
