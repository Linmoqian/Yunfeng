# 应用命令权限

`build.rs` 声明实际命令并生成细粒度 allow/deny 权限，`capabilities/default.json` 只授权本地主窗口。`desktop-services.toml` 保留既有服务编排入口；协作使用独立的 `allow-collaboration-action` 权限。自动生成目录由构建恢复，不入库。
