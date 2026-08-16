# Yunfeng 文档索引

本目录按主题组织 Yunfeng 编码 Agent 的设计对话、开发规范与接口契约。

## 开发规范（development/）

| 文档 | 说明 |
| --- | --- |
| [frontend.md](./development/frontend.md) | 前端模块化、组件规模与职责分层 |
| [rust.md](./development/rust.md) | Rust 与 Tauri 开发规范 |
| [desktop-shell.md](./development/desktop-shell.md) | 桌面 Tauri 外壳：托盘、后端编排、环境变量、Tauri 事件/命令契约 |
| [hot-reload.md](./development/hot-reload.md) | 前后端热加载（app 与 mobile-app 两个壳） |
| [verification.md](./development/verification.md) | 验证原则与页面验证方式 |
| [api-documentation.md](./development/api-documentation.md) | 接口文档模板与契约要求 |
| [code-comments.md](./development/code-comments.md) | 注释规范 |
| [concurrency.md](./development/concurrency.md) | 并发与线程约束 |
| [git-workflow.md](./development/git-workflow.md) / [github.md](./development/github.md) | Git 提交与 GitHub 流程 |
| [writing.md](./development/writing.md) | 写作与交付规范 |

## 接口契约（api/）

- [backend-api.md](./api/backend-api.md)：yunfeng-server 任务 / 会话 / 审批 API
- [gateway.md](./api/gateway.md)：yunfeng-gateway 代理路径、认证与事件流

## 设计（design/）

- [yunfeng-mobile-backend.md](./design/yunfeng-mobile-backend.md)：移动后端（配对 / RustDesk sidecar）设计
- [yunfeng-mobile-roadmap.md](./design/yunfeng-mobile-roadmap.md)：移动端功能补齐计划
- [yunfeng-mobile-taskboard-mobile.md](./design/yunfeng-mobile-taskboard-mobile.md)：任务看板移动端适配计划
- [plugin-system.md](./design/plugin-system.md)、[ui-language.md](./design/ui-language.md)
- `yunfeng-tokens.{css,json,tailwind.css}`：Yunfeng Design Tokens（桌面端与移动端共用）

## 对话归档（01–04）

按主题归档工程师与助手关于 Yunfeng 编码 Agent 的完整对话，正文保留原话：

1. [愿景与 pi 设计哲学](./01-愿景与-pi-设计哲学.md)
2. [结合 pi-code-agent 的架构方案](./02-结合-pi-code-agent-的架构方案.md)
3. [个人工作流需求与系统设计](./03-个人工作流需求与系统设计.md)
4. [对话归档方式](./04-对话归档方式.md)

## 归档约定

- 按讨论主题拆分文件。
- 同一主题内按时间顺序排列。
- `工程师` 与 `助手` 标识发言者。
- 中断后重新提交的内容也单独保留。
