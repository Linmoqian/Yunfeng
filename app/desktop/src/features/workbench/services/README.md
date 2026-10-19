# 工作区原生服务

`collaborationService.ts` 是本地团队的 Rust IPC 类型与调用入口。团队、消息、公告和安装标识由 Rust 返回；浏览器不模拟保存成功。对应接口见 `docs/api/2026-10-14-collaboration-action.md`。
