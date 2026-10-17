# Yunfeng 文档索引

本目录按当前实现、接口契约、工程规范和历史记录组织文档。复审日期：2026-10-15。

## 当前说明

- [运行架构](development/2026-10-15-runtime-architecture.md)：调用链、数据权威、Lin 目录、启动与验收边界。
- [LianAgent 资源接入](development/2026-10-15-lianagent-import.md)：依赖选择、技能来源与角色执行边界。
- [项目 README](../README.md)：目录与可执行命令。
- [Server README](../server/README.md)：Pi SDK 适配与独立配置。

变更实现时同步相应契约；历史记录保留当时结论，不作为当前能力说明。

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
- [科研自主任务](api/2026-10-15-research-runtime.md)：本地四阶段闭环、事件等待、授权、记忆与恢复。
- [gateway.md](./api/gateway.md)：yunfeng-gateway 代理路径、认证与事件流
- [组件共享](api/2026-10-14-component-sharing.md)、[本地协作](api/2026-10-14-collaboration-action.md)、[终端](api/2026-10-14-terminal-action.md)
- [团队节点与成员接口](api/2026-10-17-team-node.md)、[成员继承 SDK](../team-service/sdk/README.md)
- [文稿图片](api/2026-10-14-paper-assets.md)、[PDF 导出](api/2026-10-14-paper-pdf.md)

## 设计（design/）

- [yunfeng-mobile-backend.md](./design/yunfeng-mobile-backend.md)：移动后端（配对 / RustDesk sidecar）设计
- [yunfeng-mobile-roadmap.md](./design/yunfeng-mobile-roadmap.md)：移动端功能补齐计划
- [yunfeng-mobile-taskboard-mobile.md](./design/yunfeng-mobile-taskboard-mobile.md)：任务看板移动端适配计划
- [plugin-system.md](./design/plugin-system.md)、[ui-language.md](./design/ui-language.md)
- [移动端 Token](design/yunfeng-tokens.css)：移动端现有主题；桌面 Token 以 [tokens.css](../app/src/styles/tokens.css) 和 [ThemeProvider](../app/src/theme/ThemeProvider.tsx) 为准。

## 历史对话与迁移记录

按主题归档工程师与助手关于 Yunfeng 编码 Agent 的完整对话，正文保留原话：

1. [愿景与 pi 设计哲学](./01-愿景与-pi-设计哲学.md)
2. [结合 pi-code-agent 的架构方案](./02-结合-pi-code-agent-的架构方案.md)
3. [个人工作流需求与系统设计](./03-个人工作流需求与系统设计.md)
4. [对话归档方式](./04-对话归档方式.md)

迁移记录：

- [个人工作区迁移](development/2026-10-13-personal-workspace.md)
- [本地协作迁移](development/2026-10-14-collaboration-migration.md)
- [论文写作接入](development/2026-10-14-paper-writing.md)
- [原生交互审计](development/interaction-audit-2026-10-14.md)

## 归档约定

- 按讨论主题拆分文件。
- 同一主题内按时间顺序排列。
- `工程师` 与 `助手` 标识发言者。
- 中断后重新提交的内容也单独保留。
