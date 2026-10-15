# 当前运行架构

状态：当前实现说明。复审日期：2026-10-15。以源码、各模块 `package.json` 与配置文件为依据。

## 调用链

桌面 React 界面通过 HTTP/SSE 调用 Yunfeng Server。Server 的 `agent/sdk.ts` 设置 Lin 命名空间，在自身 Node 进程内使用 Pi SDK 创建模型服务、会话、工具与扩展。它不会连接终端中已经运行的 Pi 进程。Agent 在本机执行；模型推理位置由模型服务配置决定。

移动前端通过 Gateway 调用同一 Server，设备配对与远程屏幕另走移动后端。桌面原生文稿、本地协作、终端通过 Tauri IPC 调用 Rust。

## 数据权威与目录

| 内容 | 事实来源 | 默认位置 |
| --- | --- | --- |
| 模型、认证、全局设置和资源 | Lin 命名空间中的 Pi SDK | `~/.lin/agent/` |
| 本机项目模型环境配置 | Node 服务端在 SDK 初始化前加载，宿主变量优先 | 仓库根 `.env`；可用 `YUNFENG_ENV_FILE` 显式指定 |
| 开发 Agent 会话 | Pi JSONL 会话管理 | `~/.lin/agent/sessions/` |
| 科研检查点与运行记录 | Server TaskStore；Pi 临时会话仅作决策 | `~/.lin/tasks/` |
| 任务状态、事件和审批 | Server TaskStore | `~/.lin/tasks/` |
| 记忆 | Server MemoryStore | `~/.lin/memory/` |
| 项目设置、技能和扩展 | Lin 项目资源加载器 | `<项目>/.lin/`；Pi 也支持项目 `.agents/skills/` |
| 论文文稿与图片 | Rust SQLite | 应用数据目录中的论文存储 |
| 本地团队、消息和公告 | Rust SQLite | 应用数据目录中的协作存储 |
| 设备配对和账号 | 移动后端 SQLite | 由移动后端配置决定 |

Agent 目录优先级为 `YUNFENG_AGENT_DIR` > `LIN_CODING_AGENT_DIR` > `<YUNFENG_RUNTIME_HOME 或系统 HOME>/.lin/agent`。任务与记忆支持 `YUNFENG_DATA_DIR`。不自动读取、迁移或复制旧 `.pi`、`.yunfeng` 数据；显式导入以工程师选择为准。

## 启动与更新

- 桌面：在 `app/` 执行 `pnpm tauri dev`，统一启动 Vite 和 Tauri。
- 前端 TSX/CSS：Vite HMR 更新。
- Rust：重新编译并重启应用，核对实例数和 IPC 恢复。
- Node Server：桌面优先执行构建产物；改源码后运行 Server 构建，并重启对应服务。
- 全局 Lin 提示、扩展与角色由 `pi-assets/` 播种，技能在开发时来自 `.agents/skills/`，在打包时来自 `pi-assets/skills/`；现有目标文件不覆盖。
- Gateway 独立配置默认 `0.0.0.0:8787`，桌面编排当前为 `127.0.0.1:8787`；不能由默认桌面网关推断跨设备可达。

## 现有边界

- `server-rpc/` 是另一条 Pi 子进程实验链，不属于当前桌面启动路径，也未承诺与 Lin 目录隔离规则相同。
- `yunfeng-cli/` 当前是 TUI/CLI 组件演示，普通消息使用模拟回复。
- `yunfeng-mobile/` 是历史原型；移动开发入口为 `mobile-app/`。
- 首页“科研”启动本地自主 Runtime：Decision Layer 维护目标树与最多五个候选窗口，用规则评分、预算和尝试上限选择一个节点；Pi 负责该节点的计划与反思，工具执行后将实测反馈交回决策层。Runtime 管理四阶段核心、事件等待、候选记忆与暂停恢复。模型提案不具备工具或聊天会话；可通过 decisionModel 指定小模型。执行范围由任务权限及具体计划授权控制，节点通过后仍需核验长期目标；真实模型决策与训练质量需另行验收。详见[科研 API](../api/2026-10-15-research-runtime.md)与[决策层模块](../../server/src/research/decision/README.md)。
- 本地协作 SQLite 已接入，不能据此声称跨设备同步已经完成。

## 维护入口

科研常驻调度由 [Hook 层](../../server/src/research/hooks/README.md) 接收本地事件，合并后经 Context Builder 重读事实，再交给 Decision Layer 和 Pi。作业、模型规划和授权等待期间事件排队，单元释放后处理；文件通知只有实际内容改变才进入模型。当前接入生命周期、文件、授权和本地作业，机器人与远程平台适配器尚未接入。

前端科研卡片独立封装，`TaskFocusPanel` 与 `useTaskStream` 暂保留既有会话编排，文件分别略超 250 行和约 330 行，以限制本次对普通会话的改动范围；后续流协议调整时按快照、消息与审批职责拆分。

- [Server 配置与适配规则](../../server/README.md)
- [桌面启动与编排](desktop-shell.md)
- [后端接口契约](../api/backend-api.md)
- [本地协作契约](../api/2026-10-14-collaboration-action.md)
- [组件与文稿契约](../api/2026-10-14-component-sharing.md)
- [验证规范](verification.md)
