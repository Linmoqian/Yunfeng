# 移动薄客户端补充规则

本文件只适用于 `mobile-app/` 的架构边界。项目通用规则和冲突优先级以 [AGENTS.md](AGENTS.md) 为准，当前目录与命令见 [README.md](README.md)。

## 数据与模块

- 移动端只提供界面和 API 调用，不在设备内启动 Agent 或后端进程。
- 任务与对话经 Gateway 访问 Server；设备配对和远程屏幕访问移动后端。
- 任务事实来源在电脑侧。SSE 重连通过事件编号恢复，移动端只保存界面临时状态和连接配置。
- 请求与 SSE 解析集中在 `mobile-app/src/lib/gateway.ts`，页面通过 Hooks 消费；共享契约在 `mobile-app/src/lib/types.ts`。
- 接口变更同步更新实现、类型、测试与 [Gateway 契约](docs/api/gateway.md)。

## 验证与权限

- 在 `mobile-app/` 执行 `pnpm test` 和 `pnpm build`；真实联通检查执行 `pnpm check:api`。
- 浏览器预览与原生权限、通知及真实设备验收分别报告。
- 网关使用 Bearer token 和路径白名单；设备 token 只存哈希；凭据不得进入仓库或文档示例。
- 移动端已有样式栈沿用其现有配置，桌面 `app/` 仍使用 Ant Design Token + CSS Modules。
