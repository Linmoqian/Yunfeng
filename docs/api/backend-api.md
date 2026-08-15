<!-- markdownlint-disable MD013 -->

# Yunfeng 后端接口协议文档

## 0. 总览

### 0.1 服务拓扑

| 服务 | 包名 | 默认端口 | 绑定地址 | 运行时 | 定位 |
| --- | --- | --- | --- | --- | --- |
| yunfeng-server | `yunfeng-server` | 8000 | 127.0.0.1 | Node.js（进程内嵌 pi SDK） | **主后端**：Agent 会话、Sessions、Models、Files、Git、CWD、Tasks、Skills 全量 API |
| yunfeng-server-rpc | `yunfeng-server-rpc` | 8001 | 127.0.0.1 | Node.js（pi 子进程模式） | **B 方案替代后端**：通过官方 RpcClient spawn pi 子进程，只暴露 Agent + Sessions 子集 |

两个服务互斥部署，共用 pi 的 JSONL 会话文件目录。前端通过 Base URL 区分。所有路径兼容 `/api` 前缀（自动剥离）。

### 0.2 通用约定

- 所有接口仅监听 `127.0.0.1`，不对外网暴露。
- 请求体为 JSON（`Content-Type: application/json`），响应体为 JSON（`Content-Type: application/json; Cache-Control: no-store`）。
- 流式端点返回 `text/event-stream`（SSE），遵循 `data: <json>\n\n` 格式，每 30s 发送心跳 `:\n\n`。
- 日期时间字段统一使用 ISO 8601 UTC（如 `2026-08-10T12:00:00.000Z`）。
- 错误响应有两种风格：
  - **通用风格**（server 全局 / server-rpc 全局）：`{ "error": "<message>" }`
  - **任务领域风格**（仅 `/tasks/*` 系列路由）：`{ "error": { "code": "<code>", "message": "<message>", "retryable": <bool>, "details": <unknown> } }`

### 0.3 路由索引

**server（端口 8000）完整路由表**

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| POST | `/agent/new` | 创建新 Agent 会话 |
| POST | `/agent/:id` | 向指定会话发送命令 |
| GET | `/agent/:id` | 查询会话运行状态 |
| GET | `/agent/:id/events` | 订阅会话事件流 |
| GET | `/agent/running` | 列出运行中会话 |
| GET | `/agent/running/events` | 订阅运行中会话变更流 |
| GET | `/tasks` | 列出任务 |
| POST | `/tasks` | 创建任务 |
| POST | `/tasks/import-session` | 导入已有会话为任务 |
| GET | `/tasks/events` | 全局任务事件流 |
| GET | `/tasks/:id` | 获取任务详情 |
| PATCH | `/tasks/:id` | 更新任务标题 |
| GET | `/tasks/:id/events` | 单任务事件流 |
| GET | `/tasks/:id/conversation` | 获取任务对话上下文 |
| GET | `/tasks/:id/capabilities` | 获取任务能力（模型/工具/思考等级） |
| POST | `/tasks/:id/commands` | 向任务发送领域命令 |
| GET | `/tasks/:id/interventions` | 列出待审批介入请求 |
| POST | `/tasks/:id/interventions/:requestId` | 提交审批决议 |
| GET | `/tasks/:id/git` | 获取任务 Git 状态 |
| GET | `/tasks/:id/git/diff` | 获取任务内文件 diff |
| POST | `/tasks/:id/git/commit` | 本地安全提交 |
| POST | `/tasks/:id/git` | 发起推送审批 |
| GET | `/sessions` | 列出所有会话 |
| GET | `/sessions/:id` | 获取会话详情（含上下文） |
| PATCH | `/sessions/:id` | 重命名会话 |
| DELETE | `/sessions/:id` | 删除会话 |
| GET | `/sessions/:id/context` | 获取会话上下文 |
| GET | `/sessions/:id/state` | 获取会话运行时状态 |
| GET | `/sessions/:id/entries/:entryId/thinking` | 获取助手消息思考块内容 |
| GET | `/models` | 获取可用模型列表 |
| GET | `/models-config` | 读取模型配置 |
| PUT | `/models-config` | 写入模型配置 |
| GET | `/files/...?type=` | 文件操作（list/read/meta/download/preview） |
| GET | `/git/status` | Git 状态 |
| GET | `/git/diff` | Git 文件 diff |
| GET | `/cwd/browse` | 目录浏览 |
| POST | `/cwd/validate` | 验证工作目录路径 |
| POST | `/default-cwd` | 生成默认工作目录 |
| GET | `/home` | 获取用户 home 目录 |
| GET | `/project-trust` | 查询项目信任状态 |
| POST | `/project-trust` | 信任项目 |
| GET | `/skills` | 获取 Skills 列表 |
| GET | `/memory` | 列出/检索记忆（插件） |
| POST | `/memory` | 显式写入记忆（插件） |
| PATCH | `/memory/:id` | 确认记忆（插件） |
| DELETE | `/memory/:id` | 遗忘记忆（插件） |

**server-rpc（端口 8001）路由表**

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| POST | `/agent/new` | 创建新 Agent 会话 |
| POST | `/agent/:id` | 向指定会话发送命令 |
| GET | `/agent/:id` | 查询会话运行状态 |
| GET | `/agent/:id/events` | 订阅会话事件流 |
| GET | `/agent/running` | 列出运行中会话 |
| GET | `/agent/running/events` | 订阅运行中会话变更流 |
| GET | `/sessions` | 列出所有会话 |
| GET | `/sessions/:id` | 获取会话详情 |
| GET | `/sessions/:id/context` | 获取会话上下文 |

---

## 1. 健康检查

### `GET /health`

**server 返回：**

```json
{ "ok": true, "service": "yunfeng-server", "version": "0.1.0" }
```

**server-rpc 返回：**

```json
{ "ok": true, "service": "yunfeng-server-rpc", "version": "0.1.0" }
```

用途：前端启动后轮询此端点，等待 `PI_SERVER_READY <port>` 信号后确认服务就绪。

---

## 2. Agent 会话 API

Agent 会话 API 是前后端交互的核心，封装了 pi coding-agent 的所有运行时操作。所有命令以 `{ "type": "<command>", ... }` 形式发送。

### 2.1 `POST /agent/new` -- 创建新会话

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cwd` | string | 是 | 工作目录绝对路径，须存在 |
| `type` | string | 否 | pi 命令类型；`"ensure_session"` 表示仅创建会话不发送 prompt |
| `provider` | string | 否 | 模型提供方（与 `modelId` 同时提供） |
| `modelId` | string | 否 | 模型 ID（与 `provider` 同时提供） |
| `toolNames` | string[] | 否 | 初始激活工具名列表 |
| `thinkingLevel` | string | 否 | 思考等级：`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` |
| `message` | string | 否 | 当 `type` 为 `prompt` 时的用户消息 |
| `images` | object[] | 否 | 图片附件（`{ type: "image", data: string, mimeType: string }`） |
| `streamingBehavior` | string | 否 | 流式行为：`steer` / `followUp` |

**响应（200）：**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | boolean | 是否成功 |
| `sessionId` | string | pi 运行时分配的真实会话 ID |
| `data` | unknown | 命令执行结果（`ensure_session` 时为 `null`） |
| `model` | object / null | `{ provider, modelId }` 或 `null` |
| `thinkingLevel` | string / undefined | 当前思考等级 |

### 2.2 `POST /agent/:id` -- 向会话发送命令

路径参数 `:id` 为会话 ID（URL 编码）。如果会话不在内存中，自动从 JSONL 恢复。

**请求体：** pi 命令对象，`type` 字段决定命令类型（见下方命令清单）。

**响应（200）：**

```json
{ "success": true, "data": "<command result>" }
```

**响应（404）：** 会话不存在。

#### Agent 命令清单（server 进程内嵌模式）

| `type` | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `prompt` | `message`, `images?`, `streamingBehavior?` | `null`（异步，结果通过事件流推送） | 发送用户消息 |
| `abort` | -- | `null` | 中止当前运行 |
| `get_state` | -- | 见下方状态结构 | 查询会话状态 |
| `set_model` | `provider`, `modelId` | `{ id, provider }` | 切换模型 |
| `fork` | `entryId` | `{ cancelled, newSessionId? }` | 从指定 entry 分叉 |
| `navigate_tree` | `targetId` | `{ cancelled }` | 导航到树节点 |
| `set_thinking_level` | `level` | `null` | 设置思考等级 |
| `compact` | `customInstructions?` | compact 结果 | 压缩上下文 |
| `set_session_name` | `name` | `null` | 重命名会话 |
| `get_session_stats` | -- | `{ ..., sessionName }` | 会话统计 |
| `get_last_assistant_text` | -- | `{ text }` | 最后一条助手文本 |
| `set_auto_compaction` | `enabled` | `null` | 切换自动压缩 |
| `set_auto_retry` | `enabled` | `null` | 切换自动重试 |
| `clear_queue` | -- | queue clear result | 清空排队消息 |
| `steer` | `message`, `images?` | `null` | 插入 steer 消息 |
| `follow_up` | `message`, `images?` | `null` | 排入 follow-up 消息 |
| `get_tools` | -- | `[{ name, description, active }]` | 列出所有工具 |
| `get_commands` | -- | `{ commands: [{ name, description, source, sourceInfo }] }` | 列出可用斜杠命令和技能 |
| `set_tools` | `toolNames` | `null` | 设置激活工具集 |
| `reload` | -- | `{ success: true }` | 重载会话 |
| `abort_compaction` | -- | `null` | 中止压缩 |
| `bash` | `command`, `excludeFromContext?` | bash 执行结果 | 执行 shell 命令 |
| `abort_bash` | -- | `null` | 中止 shell 命令 |

#### `get_state` 返回结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sessionId` | string | 会话 ID |
| `sessionFile` | string | JSONL 文件路径 |
| `isStreaming` | boolean | 是否正在流式输出 |
| `isPromptRunning` | boolean | 是否有 prompt 正在执行 |
| `isBashRunning` | boolean | 是否有 shell 命令在执行 |
| `isCompacting` | boolean | 是否正在压缩上下文 |
| `autoCompactionEnabled` | boolean | 自动压缩开关 |
| `autoRetryEnabled` | boolean | 自动重试开关 |
| `model` | object / undefined | `{ id, provider }` |
| `messageCount` | number | 消息计数 |
| `pendingMessageCount` | number | 待处理消息计数 |
| `queuedMessages` | object | `{ steering: [], followUp: [] }` |
| `contextUsage` | object / null | `{ percent, contextWindow, tokens }` |
| `systemPrompt` | string | 当前系统提示 |
| `thinkingLevel` | string | 当前思考等级 |

#### server-rpc 额外支持的命令

server-rpc 通过官方 RpcCommand 透传，额外支持：`cycle_model`、`get_available_models`、`cycle_thinking_level`、`get_available_thinking_levels`、`set_steering_mode`、`set_follow_up_mode`、`abort_retry`、`export_html`、`switch_session`、`clone`、`get_fork_messages`、`get_entries`、`get_tree`、`get_messages`、`new_session`。

### 2.3 `GET /agent/:id` -- 查询会话状态

**响应（200）：**

- 会话活跃：`{ running: true, state: <get_state 结果> }`
- 会话不活跃：`{ running: false }`

### 2.4 `GET /agent/:id/events` -- 会话事件流（SSE）

如果会话不在内存中，自动从 JSONL 恢复并启动。

**事件格式：** `data: <json>\n\n`

首帧：`{ "type": "connected", "sessionId": "<id>" }`

后续为 pi 原始事件透传，主要事件类型见下方 Agent 事件清单。

#### Agent 事件清单（pi 原始事件透传）

| 事件 `type` | 关键字段 | 说明 |
| --- | --- | --- |
| `connected` | `sessionId` | SSE 连接建立 |
| `agent_end` | -- | Agent 一轮运行结束 |
| `agent_settled` | -- | Agent 稳定结束（等待输入） |
| `prompt_done` | -- | 非流式 prompt 完成 |
| `prompt_error` | `errorMessage` | prompt 执行失败 |
| `message_update` | `assistantMessageEvent` | 消息增量（`text_delta` / `thinking_delta` / `message_end`） |
| `message_end` | -- | 消息完整到达 |
| `tool_execution_start` | `toolCallId`, `toolName`, `args` | 工具调用开始 |
| `tool_execution_update` | `toolCallId`, `toolName`, `partialResult` | 工具调用增量 |
| `tool_execution_end` | `toolCallId`, `toolName`, `isError`, `result` | 工具调用结束 |
| `compaction_start` | -- | 上下文压缩开始 |
| `compaction_end` | -- | 上下文压缩结束 |
| `turn_start` | -- | 新一轮开始 |
| `queue_update` | -- | 排队消息变更 |
| `extension_error` | `extensionPath`, `event`, `error` | 扩展错误 |

### 2.5 `GET /agent/running` -- 列出运行中会话

**响应：** `{ "runningSessionIds": ["<id>", ...] }`

### 2.6 `GET /agent/running/events` -- 运行中会话变更流（SSE）

当运行中会话列表变化时推送：`{ "type": "running", "runningSessionIds": [...] }`

---

## 3. 任务领域 API（仅 server）

任务领域 API 在 pi Agent 会话之上引入了结构化的任务状态机、命令分发、事件持久化、审批流和 Git 闭环。所有数据持久化在 `~/.yunfeng/tasks/<task-id>/` 下。

### 3.1 任务状态模型

#### TaskState

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | `1` | 模式版本 |
| `id` | string (UUID) | 任务 ID |
| `sessionId` | string | 关联的 pi 会话 ID |
| `cwd` | string | 工作目录 |
| `title` | string | 任务标题（取首条消息前 60 字符） |
| `source` | `"task"` / `"legacy"` / `"history"` | 来源 |
| `status` | TaskStatus | 当前状态 |
| `phase` | TaskPhase | 当前阶段 |
| `currentAction` | string | 当前动作描述 |
| `attentionReason` | string / undefined | 需要用户关注的原因 |
| `model` | TaskModelRef / undefined | `{ provider, modelId }` |
| `thinkingLevel` | string / undefined | 思考等级 |
| `activeToolNames` | string[] | 激活工具列表 |
| `pendingApprovalIds` | string[] | 待审批请求 ID 列表 |
| `gitBaseline` | string[] / undefined | 任务开始时已脏文件路径（区分任务产出） |
| `createdAt` | string | 创建时间 ISO 8601 |
| `updatedAt` | string | 更新时间 ISO 8601 |
| `completedAt` | string / undefined | 完成时间 |
| `archivedAt` | string / undefined | 归档时间 |
| `lastEventSeq` | number | 最后事件序号 |

**TaskStatus 枚举：** `running` / `waiting_input` / `waiting_approval` / `failed` / `completed` / `archived`

**TaskPhase 枚举：** `understanding` / `planning` / `implementing` / `verifying` / `committing` / `done` / `unknown`

### 3.2 `GET /tasks` -- 列出任务

**查询参数：**

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `q` | string | -- | 搜索关键词（匹配 title / currentAction / cwd） |
| `project` | string | -- | 项目路径过滤（cwd 后缀或包含匹配） |
| `status` | string | -- | 状态过滤（逗号分隔，如 `running,waiting_input`） |
| `archived` | string | -- | `"true"` 仅归档，`"false"` 排除归档 |
| `cursor` | string | -- | 游标（上一页最后一条 task ID） |
| `limit` | number | 100 | 每页数量（1-500） |

**响应：**

```jsonc
{
  "tasks": [ /* TaskState[] */ ],
  "nextCursor": "<task-id>",  // 可选，无更多数据时省略
  "total": 42
}
```

结果按 `updatedAt` 降序排列。

### 3.3 `POST /tasks` -- 创建任务

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cwd` | string | 是 | 工作目录绝对路径 |
| `message` | string | 是 | 首条用户消息（同时作为任务标题前 60 字符） |
| `model` | object | 否 | `{ provider: string, modelId: string }` |

**响应（200）：**

```json
{ "task": "<TaskState>", "sessionId": "<pi-session-id>" }
```

**错误码：**

| 代码 | HTTP 状态 | 说明 |
| --- | --- | --- |
| `bad_request` | 400 | cwd 缺失 / 目录不存在 / message 为空 |
| `task_create_failed` | 500 | 会话创建或 prompt 发送失败 |

### 3.4 `POST /tasks/import-session` -- 导入已有会话为任务

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | string | 是 | 已存在的 pi 会话 ID |

**响应（200）：** `{ "task": "<TaskState>", "sessionId": "<id>" }`

### 3.5 `GET /tasks/:id` -- 获取任务详情

**响应（200）：** `{ "task": "<TaskState>" }`

**响应（404）：** `{ "error": { "code": "task_not_found", ... } }`

### 3.6 `PATCH /tasks/:id` -- 更新任务

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 新标题（不能为空字符串） |

**响应（200）：** `{ "task": "<TaskState>" }`

### 3.7 `POST /tasks/:id/commands` -- 发送领域命令

这是任务工作台的核心交互端点，统一分发所有任务命令。

**请求体：** TaskCommand 联合类型

| `type` | 额外参数 | 说明 |
| --- | --- | --- |
| `prompt` | `message`, `images?`, `references?` | 发送用户消息，任务进入 running |
| `steer` | `message`, `images?`, `references?` | 插入 steer 消息（须 running/waiting_approval） |
| `followUp` | `message`, `images?`, `references?` | 排入 follow-up 消息（须 running/waiting_approval） |
| `abort` | -- | 中止当前运行 |
| `clearQueue` | -- | 清空排队消息 |
| `getQueue` | -- | 查询排队消息 |
| `retry` | -- | 从 failed 恢复到 waiting_input |
| `compact` | `instructions?` | 压缩上下文 |
| `fork` | `entryId` | 从指定 entry 分叉 |
| `setModel` | `provider`, `modelId` | 切换模型（运行中拒绝） |
| `setThinkingLevel` | `level` | 设置思考等级（运行中拒绝） |
| `setTools` | `toolNames` | 设置工具（运行中拒绝） |
| `complete` | -- | 标记完成 |
| `reopen` | -- | 从完成态重新打开 |
| `archive` | -- | 归档任务 |

**响应（200）：** `{ "ok": true, "result": "<command result>" }`

**错误码：**

| 代码 | HTTP 状态 | 说明 |
| --- | --- | --- |
| `bad_request` | 400 | 未知或非法的领域命令 |
| `task_not_found` | 404 | 任务不存在 |
| `not_running` | 409 | 任务未在运行，无法执行 steer/followUp |
| `session_not_active` | 409 | 会话未激活 |
| `cannot_change_while_running` | 409 | 运行中禁止切换模型/工具/思考等级 |
| `command_failed` | 500 | 命令执行失败 |

### 3.8 `GET /tasks/:id/capabilities` -- 获取任务能力

**响应（200）：**

```jsonc
{
  "capabilities": {
    "model": { "provider": "...", "modelId": "..." },  // 或 null
    "thinkingLevel": "medium",  // 或 null
    "activeTools": ["read", "bash", "edit"],
    "tools": [{ "name": "read", "active": true }]
  }
}
```

### 3.9 `GET /tasks/:id/conversation` -- 获取任务对话

内部委托 `handleSessionContext`，返回会话上下文。

**查询参数：** `leafId`、`deferThinking`、`deferMedia`（详见 Sessions API）

**响应：** `{ "context": "<SessionContext>" }`

### 3.10 审批/介入 API

#### `GET /tasks/:id/interventions` -- 列出待审批介入

**响应（200）：** `{ "interventions": ["<TaskIntervention>"] }`（仅 `status: "pending"`）

#### TaskIntervention 结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string (UUID) | 介入请求 ID |
| `taskId` | string | 所属任务 ID |
| `kind` | `"confirm"` / `"select"` / `"input"` | 类型 |
| `title` | string | 标题 |
| `message` | string | 说明 |
| `options` | string[] | select 类型的选项 |
| `defaultValue` | string | input 类型的预填值 |
| `safeLabel` | string | confirm 的安全标签（如 `"git push"`） |
| `impact` | string | 影响范围说明 |
| `status` | `"pending"` / `"resolved"` / `"timed_out"` | 状态 |
| `value` | string / boolean / null | 决议结果 |
| `createdAt` | string | 创建时间 |
| `resolvedAt` | string | 解决时间 |

#### `POST /tasks/:id/interventions/:requestId` -- 提交审批

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `decision` | `"approve"` / `"reject"` | 是 | 审批决议 |
| `value` | string | 否 | select/input 的选择值（覆盖 decision 的布尔值） |

**响应（200）：** `{ "ok": true }`

**错误码：**

| 代码 | HTTP 状态 | 说明 |
| --- | --- | --- |
| `task_not_found` | 404 | 任务不存在 |
| `bad_request` | 400 | decision 不是 approve/reject |
| `intervention_not_found` | 404 | 审批请求不存在或已被处理 |

### 3.11 任务 Git 闭环

#### `GET /tasks/:id/git` -- 任务 Git 状态

返回当前 Git 变更，并按 `gitBaseline` 区分任务产出文件和任务前已有改动。

**响应（200）：**

```jsonc
{
  "git": {
    "isGitRepository": true,
    "repositoryRoot": "/path/to/repo",
    "files": ["<GitFileStatus>"],
    "taskFiles": ["<GitFileStatus>"],
    "baselineFiles": ["<GitFileStatus>"],
    "baseline": ["/abs/path/file"]
  }
}
```

#### `GET /tasks/:id/git/diff` -- 文件 diff

**查询参数：** `path`（绝对路径，必填）

**响应：** `<GitFileDiffResponse>`

#### `POST /tasks/:id/git/commit` -- 本地安全提交

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `message` | string | 是 | Conventional Commits 格式提交信息 |

安全策略：

- 只提交任务产出且未在基线的文件
- 拒绝 `.env`、密钥文件、`node_modules`、构建产物
- 提交信息须匹配 `/^[a-z]+(\([a-z0-9_-]+\))?!?: .+/`

**响应（200）：** `{ "ok": true, "commit": { "ok": true, "commitSha": "...", "message": "...", "files": [...] } }`

**错误码：**

| 代码 | HTTP 状态 | 说明 |
| --- | --- | --- |
| `commit_rejected` | 409 | 无任务改动 / 仅含基线 / 提交信息不合规 |
| `commit_failed` | 500 | git commit 失败 |

#### `POST /tasks/:id/git` -- 发起推送审批

推送始终走审批流：先检查前置条件，再生成审批卡。

**响应（200）：** `{ "ok": true, "approvalRequestId": "<intervention-id>", "push": { "branch": "...", "remote": "..." } }`

**错误码：**

| 代码 | HTTP 状态 | 说明 |
| --- | --- | --- |
| `push_rejected` | 409 | 非 Git 仓库 / 无分支 / 无上游 |

### 3.12 任务事件流

#### `GET /tasks/events` -- 全局任务事件流（SSE）

订阅所有任务的状态变更事件。

首帧：`{ "type": "task_snapshot", "tasks": ["<TaskState>"], "seq": 0 }`

#### `GET /tasks/:id/events` -- 单任务事件流（SSE）

**查询参数：** `afterSeq`（数字，断线重连补发）

连接时自动补发 `afterSeq` 之后的历史事件。

#### TaskEvent 结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string (UUID) | 事件 ID |
| `taskId` | string | 所属任务 ID |
| `seq` | number | 任务内递增序号 |
| `occurredAt` | string | ISO 8601 时间戳 |
| `type` | TaskEventName | 事件类型 |
| `data` | unknown | 事件载荷 |

**TaskEventName 枚举：** `task_snapshot` / `task_updated` / `message_delta` / `thinking_delta` / `message_completed` / `tool_started` / `tool_updated` / `tool_finished` / `approval_requested` / `approval_resolved` / `queue_updated` / `context_updated` / `compaction_started` / `compaction_finished` / `git_changed` / `artifact_changed` / `run_failed` / `run_settled`

SSE 行格式：`id: <seq>\ndata: <json>\n\n`

---

## 4. Sessions API

Sessions API 直接读取 pi 的 JSONL 会话文件，无需启动 Agent 运行时。

### 4.1 `GET /sessions` -- 列出所有会话

**响应：**

```jsonc
{
  "sessions": ["<SessionInfo>"],
  "runningSessionIds": ["<id>"]
}
```

#### SessionInfo 结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string | JSONL 文件路径 |
| `id` | string | 会话 ID |
| `cwd` | string / undefined | 工作目录 |
| `name` | string | 会话名称 |
| `created` | string | 创建时间 ISO 8601 |
| `modified` | string | 修改时间 ISO 8601 |
| `messageCount` | number | 消息数 |
| `firstMessage` | string | 首条用户消息预览 |
| `parentSessionId` | string / undefined | 父会话 ID |
| `projectRoot` | string / undefined | 项目根（等于 cwd） |

### 4.2 `GET /sessions/:id` -- 获取会话详情

**查询参数：**

| 参数 | 说明 |
| --- | --- |
| `deferThinking` | 存在时省略思考块内容（标记 `deferred: true`） |
| `deferMedia` | 存在时省略工具结果中的图片 |

**响应（200）：**

```jsonc
{
  "sessionId": "<id>",
  "filePath": "<jsonl path>",
  "info": { /* SessionInfo 展开 */ },
  "leafId": "<entry id>",
  "context": { /* SessionContext */ }
}
```

#### SessionContext 结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `messages` | SessionMessage[] | 消息列表 |
| `entryIds` | string[] | 对应的 entry ID 列表 |
| `thinkingLevel` | string / undefined | 会话思考等级 |
| `model` | `{ provider, modelId }` / undefined | 会话模型 |

### 4.3 `PATCH /sessions/:id` -- 重命名会话（仅 server）

**请求体：** `{ "name": "<new name>" }`

**响应（200）：** `{ "ok": true }`

### 4.4 `DELETE /sessions/:id` -- 删除会话（仅 server）

删除 JSONL 文件，并修复子会话的 `parentSession` 指向被删会话的父会话。

**响应（200）：** `{ "ok": true }`

### 4.5 `GET /sessions/:id/context` -- 获取会话上下文

**查询参数：** `leafId`、`deferThinking`、`deferMedia`

**响应：** `{ "context": "<SessionContext>" }`

### 4.6 `GET /sessions/:id/state` -- 会话运行时状态（仅 server）

**响应（200）：**

- 运行中：`{ "running": true, "state": "<get_state 结果>" }`
- 未运行：`{ "running": false }`

### 4.7 `GET /sessions/:id/entries/:entryId/thinking` -- 获取思考块（仅 server）

**查询参数：** `blockIndex`（非负整数，必填）

**响应（200）：** `{ "thinking": "<content>" }`

**响应（404）：** 会话/消息/思考块不存在

---

## 5. Models API（仅 server）

### 5.1 `GET /models` -- 获取可用模型列表

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cwd` | string | 是 | 工作目录绝对路径 |

**响应（200）：** ModelsData 结构

#### ModelsData 结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `models` | `Record<string, string>` | 模型 key (`"provider:id"`) 到显示名的映射 |
| `modelList` | `{ id, name, provider }[]` | 模型列表（按名称排序） |
| `defaultModel` | `{ provider, modelId }` / null | 默认模型 |
| `thinkingLevels` | `Record<string, string[]>` | 每个模型支持的思考等级 |
| `thinkingLevelMaps` | `Record<string, Record<string, string>>` | 思考等级映射 |
| `thinkingLevelPins` | `Record<string, string>` | 被固定的思考等级 |
| `modelError` | string / undefined | 模型运行时错误信息 |
| `modelScopeWarnings` | string[] / undefined | 模型作用域警告 |

模型列表有 60s TTL 内存缓存，切换模型时自动失效。

### 5.2 `GET /models-config` -- 读取模型配置

读取 pi agentDir 下的 `models.json`。

**响应（200）：** 原始 JSON 配置对象。

### 5.3 `PUT /models-config` -- 写入模型配置

**请求体：** 模型配置 JSON 对象。

**响应（200）：** `{ "success": true }`

---

## 6. Files API（仅 server）

### `GET /files/...?type=<type>`

路径段 `/files/` 之后为绝对路径分段，每段 URL 编码。例如 `/files/Users%2Flin%2Fproject/src?type=read`。

**查询参数：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | string | 否 | `list` | 操作类型 |

**`type` 取值：**

| type | 用途 | 响应 |
| --- | --- | --- |
| `list` | 列出目录内容 | `{ entries: [{ name, isDir, size, modified }], path }` |
| `read` | 读取文件内容 | `{ content, language, size }`（最大 256KB） |
| `meta` | 获取文件元信息 | `{ size, language, mime, previewKind }` |
| `download` | 下载文件 | base64 流（`Content-Type: application/octet-stream`） |
| `preview` | 预览（当前未实现，返回 400） | -- |
| `watch` | 监视（当前未实现，返回 400） | -- |

**文件访问授权：** 只允许访问已注册会话的 cwd 及 `~/pi-cwd-*` 目录（5s TTL 缓存）。授权列表之外返回 403。

**目录列表过滤：** 自动排除 `node_modules`、`.git`、`dist`、`build`、`__pycache__` 等目录。

---

## 7. Git API（仅 server）

### 7.1 `GET /git/status`

**查询参数：** `cwd`（绝对路径，必填）

**响应（200）：** GitStatusResponse

#### GitStatusResponse 结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `isGitRepository` | boolean | 是否 Git 仓库 |
| `repositoryRoot` | string / null | 仓库根路径 |
| `files` | GitFileStatus[] | 变更文件列表 |
| `additions` | number | 新增行数（含 untracked 估算） |
| `deletions` | number | 删除行数 |

#### GitFileStatus 结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `filePath` | string | 文件绝对路径 |
| `status` | `"modified"` / `"added"` / `"deleted"` / `"untracked"` / `"renamed"` / `"copied"` / `"updated"` / `"unmerged"` | 变更类型 |
| `indexStatus` | string | 暂存区状态码 |
| `worktreeStatus` | string | 工作区状态码 |

### 7.2 `GET /git/diff`

**查询参数：** `cwd`（绝对路径）、`path`（绝对路径），均必填。

**响应（200）：**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `supported` | boolean | 是否支持 diff |
| `status` | GitFileStatus["status"] / undefined | 变更类型 |
| `patch` | string / undefined | unified diff 补丁文本 |

---

## 8. CWD / 目录 API（仅 server）

### 8.1 `GET /cwd/browse` -- 目录浏览

**查询参数：** `path`（可选，默认 home 目录）

**响应（200）：**

```jsonc
{
  "path": "/resolved/path",
  "parentPath": "/parent",
  "directories": [{ "name": "...", "path": "..." }]
}
```

### 8.2 `POST /cwd/validate` -- 验证路径

**请求体：** `{ "cwd": "<path>" }`（支持 `~` 和 `~/` 前缀）

**响应（200）：** `{ "success": true, "cwd": "<normalized path>" }`

**响应（400）：** 路径不存在 / 不是目录

### 8.3 `POST /default-cwd` -- 生成默认工作目录

创建 `~/pi-cwd-<YYYYMMDD>` 目录。

**响应（200）：** `{ "cwd": "<path>" }`

### 8.4 `GET /home` -- 获取 home 目录

**响应（200）：** `{ "home": "<home path>" }`

---

## 9. 项目信任 API（仅 server）

### 9.1 `GET /project-trust`

**查询参数：** `cwd`（必填）

**响应：**

```json
{ "requiresTrust": true, "trusted": false }
```

### 9.2 `POST /project-trust`

**请求体：** `{ "cwd": "<path>" }`

信任指定项目目录。仅在 `requiresTrust` 为 `true` 时生效。

**响应：** `{ "requiresTrust": true, "trusted": true }`

---

## 10. Skills API（仅 server）

### `GET /skills`

**查询参数：** `cwd`（必填）

**响应（200）：**

```jsonc
{
  "skills": [{
    "name": "...",
    "description": "...",
    "filePath": "",
    "baseDir": "",
    "disableModelInvocation": false,
    "sourceInfo": { "source": "...", "scope": "..." }
  }],
  "diagnostics": [],
  "projectResourcesLoaded": true
}
```

---

## 11. 记忆 API（插件，仅 server）

记忆模块是 Yunfeng 插件系统的第一个内置插件（`id: "memory"`）。四类记忆：`preference`（偏好）、`project_fact`（项目事实）、`procedure`（流程）、`episode`（经验）。设计见 [docs/design/plugin-system.md](../design/plugin-system.md)。

写入策略：`user_explicit` 直接 `confirmed`；`agent_inferred` / `observed` 落 `candidate`，`useCount ≥ 3` 自动转 `confirmed`；`PATCH` 显式确认立即转正。

插件可通过 `YUNFENG_DISABLE_MEMORY_PLUGIN=1` 关闭，关闭后以下端点返回 404。

### 11.1 `GET /memory` -- 列出/检索记忆

**查询参数：**

| 参数 | 说明 |
| --- | --- |
| `q` | 内容/主题关键词过滤 |
| `kind` | 记忆类型：`preference` / `project_fact` / `procedure` / `episode` |
| `confidence` | 置信度：`candidate` / `confirmed` |
| `project` | 项目标识过滤 |

**响应：**

```json
{
  "memories": [
    {
      "id": "…",
      "kind": "preference",
      "content": "修改后自动提交，推送必须确认",
      "source": "user_explicit",
      "scope": "global",
      "confidence": "confirmed",
      "topics": ["提交", "推送"],
      "createdAt": "2026-08-13T00:00:00.000Z",
      "lastUsedAt": "2026-08-13T00:00:00.000Z",
      "useCount": 0,
      "schemaVersion": 1
    }
  ]
}
```

### 11.2 `POST /memory` -- 显式写入记忆

**请求体：**

```json
{
  "kind": "preference",
  "content": "修改后自动提交，推送必须确认",
  "scope": "project",
  "projectKey": "yunfeng",
  "topics": ["git", "commit"]
}
```

`kind` 为 `procedure` 时需额外提供 `steps: string[]`；`kind` 为 `episode` 时需额外提供 `lesson: string`。

**响应：** `201`，返回创建的完整记忆对象。错误：`400`（kind 非法 / content 为空 / procedure 无 steps / episode 无 lesson）。

### 11.3 `PATCH /memory/:id` -- 确认记忆

将候选记忆转为 `confirmed`。已确认记忆幂等返回。

**响应：** `200` 返回确认后的记忆对象；`404` 记忆不存在。

### 11.4 `DELETE /memory/:id` -- 遗忘记忆

永久删除记忆。

**响应：** `200` `{ "ok": true }`；`404` 记忆不存在。

---

## 12. 持久化与安全约束

### 12.1 数据存储位置

| 数据 | 位置 | 格式 |
| --- | --- | --- |
| pi 会话文件 | pi agentDir 下的 sessions 目录 | JSONL（首行 header，后续 entries） |
| 模型配置 | pi agentDir 下 `models.json` | JSON |
| 任务状态 | `~/.yunfeng/tasks/<task-id>/state.json` | JSON（原子写入） |
| 任务事件 | `~/.yunfeng/tasks/<task-id>/events.jsonl` | JSONL（每行一个 TaskEvent） |
| 介入请求 | `~/.yunfeng/tasks/<task-id>/interventions.jsonl` | JSONL（每行一个 TaskIntervention） |
| 记忆 | `~/.yunfeng/memory/memories.jsonl` | JSONL（每行一个 Memory） |
| 项目信任 | pi agentDir 下 trust store | 内部格式 |

环境变量 `YUNFENG_DATA_DIR` 可覆盖 `~/.yunfeng` 基础目录。

### 12.2 会话生命周期

- **空闲超时**：会话 10 分钟无活动后自动销毁（`AgentSessionWrapper` 内置 idle timer）。
- **进程退出**：`SIGINT` / `SIGTERM` 触发 `destroyAllSessions()`，关闭所有 SSE 连接。
- **锁机制**：同一 sessionId 的并发 `startRpcSession` 通过 Promise 锁去重。

### 12.3 文件访问安全

- 允许根目录 = 所有已注册会话的 cwd + `~/pi-cwd-*`（5s TTL 缓存）。
- 所有文件操作均校验路径是否在允许根目录内。
- 已存在路径先做词法校验，再对目标与允许根做 `realpath` 解析后二次比较，拒绝通过符号链接越出允许根。
- Git 操作要求 cwd 为绝对路径。

### 12.4 审批安全

- 服务重启后，所有未决审批标记为 `timed_out`，绝不自动放行。
- 无 handler 注册时，默认拒绝所有 confirm/select/input 请求。
- 推送操作始终需要审批，审批通过后才执行 `git push`。

### 12.5 提交安全

- 敏感文件正则：`.env*`、`id_rsa`、`id_ed25519`、`*.pem`、`*.key`、`*.p12`
- 构建产物正则：`node_modules`、`dist`、`build`、`.next`、`__pycache__`、`.venv` 等
- 逐文件精确 `git add`，不会意外暂存无关文件

---

## 13. 兼容性与变更记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-08-15 | 0.1.0 | 修复任务 API 错误响应：结构化错误此前错误返回 HTTP 200，现与错误码表一致返回 400/404/409/500 |
| 2026-08-10 | 0.1.0 | 初始文档：基于 server/src 和 server-rpc/src 全量源码编写，覆盖全部路由 |
