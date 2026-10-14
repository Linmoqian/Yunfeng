# 本地协作底座

第一批只提供 Rust 权威的本地团队、消息、公告和安装标识。`model.rs` 定义校验与 DTO，`store.rs` 管理 SQLite，`mod.rs` 是 Tauri 适配与有界调度入口。安装 UUID 不构成网络认证凭据。

数据库保存在应用数据目录的 `collaboration/store.sqlite3`，采用 WAL、事务、外键及团队消息索引。查询只返回最新 200 条消息，每队最多 10000 条。本地关闭团队保留数据，可重新打开。

不会创建监听端口或发起发现。设备配对、签名身份、远端成员和消息同步在后续批次接入。运行 `cargo test collaboration` 验证存储与边界规则。
