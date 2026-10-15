# Yunfeng Server

本地 HTTP/SSE 服务负责管理任务、项目和会话。开发 Agent 由 Pi SDK 组装；科研模式使用四阶段核心与外层事件 Runtime，决策模型提出局部候选，规则维护目标树、排序与预算，再由 Pi 在无工具的临时会话中提供节点计划与反思。科研记录和检查点复用 TaskStore，候选学习复用 MemoryStore。

## 独立 Lin 配置

默认目录如下：

| 路径 | 内容 |
| --- | --- |
| `~/.lin/agent/` | `models.json`、`auth.json`、`settings.json`、`AGENTS.md`、扩展、技能、提示词、主题、项目信任记录 |
| `~/.lin/agent/sessions/` | Pi 格式的会话文件 |
| `~/.lin/tasks/` | Yunfeng 任务状态和事件 |
| `~/.lin/memory/` | Yunfeng 记忆插件数据 |
| `<项目>/.lin/` | 项目级设置、扩展、技能、提示词和系统提示词 |

全局 Agent 目录优先级：`YUNFENG_AGENT_DIR` > `LIN_CODING_AGENT_DIR` > `<YUNFENG_RUNTIME_HOME 或系统 HOME>/.lin/agent`。任务与记忆目录仍支持 `YUNFENG_DATA_DIR` 显式覆盖。

Server 不默认读取 `~/.pi` 或项目 `.pi`，也不自动复制旧配置、凭据或会话。首次使用需在 Lin 目录配置模型认证；旧任务列表不会自动进入新的目录。显式导入会话或配置资源路径仍以工程师的选择为准。

本机开发也可在仓库根 `.env` 配置模型，字段见 [脱敏示例](../.env.example)。Node 服务端使用内置 `loadEnvFile` 在 SDK 初始化前加载，宿主同名变量优先；`YUNFENG_ENV_FILE` 可指定其他环境文件。默认根 `.env` 缺失时跳过，显式文件不可读时停止启动。该文件由服务端读取，模型密钥不得使用前端的 `VITE_` 前缀。

`YUNFENG_MODEL_PROVIDER` 与 `YUNFENG_MODEL_ID` 一起指定项目默认模型，优先于 Lin 设置的默认值；任务显式选定模型继续优先，已启用模型范围仍生效。密钥变量名沿用 Pi SDK 对应服务商的约定，例如 `ZAI_API_KEY`。环境文件改动后需重启 Server；真实 `.env` 不入 Git，也不自动读取原 Pi 配置。

`src/agent/sdk.ts` 是所有运行时 Pi SDK 导入的唯一入口。它在 SDK 首次加载前通过 Pi 的 `PI_PACKAGE_DIR` 与本包 `piConfig` 元数据，将 `name` 设为 `lin`、`configDir` 设为 `.lin`，随后把资产根恢复为原 SDK 包，保留其主题与导出模板。适配层检测到 SDK 提前按 `.pi` 初始化时会拒绝启动，避免静默回退。不要直接在其他 Server 模块中导入 SDK 的运行时值；类型导入可直接使用原包。

## 开发与验证

科研实现入口见 [research/README](src/research/README.md)，公开契约见[科研任务 API](../docs/api/2026-10-15-research-runtime.md)。首页选择科研并输入项目目录与目标后启动；暂停/继续以服务端检查点为准。

在 `server/` 执行 `pnpm build`、`pnpm test`。桌面联调使用 `app/` 的 `pnpm tauri dev`。独立启动使用 `pnpm start`，可写 HOME 启动使用 `pnpm start:portable`。

适配依赖当前锁定的 Pi SDK 配置加载规则。升级 SDK 时须运行 Lin 隔离测试，核对项目资源、全局配置、会话路径及原包资产加载。
