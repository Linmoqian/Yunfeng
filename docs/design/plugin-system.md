# Yunfeng 插件系统设计

## 1. 目标与边界

Yunfeng 遵循「内核只提供稳定原语，不内置具体工作流」的哲学，把记忆、工作流、策略等能力做成**可插拔插件**，而不是内嵌在 `server` 内核中。内核只负责注册与分发，不知道任何具体插件的存在；关掉插件，server 完全不受影响。

第一版范围：**最小插件内核 + 记忆插件试点**。任务领域（task）不做插件化，外部插件动态加载不做。

## 2. 与 pi extensions 的对齐

事件命名与拦截语义对齐 pi 官方扩展机制（`pi/packages/coding-agent/docs/extensions.md`），但类型与上下文是 Yunfeng 自有领域协议，不暴露 pi 对象，保证「pi 可替换」。

| Yunfeng 插件钩子 | pi 事件 | 拦截/返回值语义 | 记忆插件用途 |
|---|---|---|---|
| `init` / `dispose` | 工厂函数 / `session_shutdown` | — | 加载存储、退出清理 |
| `session_start` | `session_start` | — | 会话开始，重建状态 |
| `before_agent_start` | `before_agent_start` | 返回 `{message, systemPrompt}` 注入 | 检索记忆注入上下文 |
| `context` | `context` | 返回 `{messages}` 替换 | 修改发给模型的消息（暂缓桥接） |
| `tool_call` | `tool_call` | 返回 `{block:true}` 拦截；`event.input` 就地可变 | 拦截越权写记忆（暂缓桥接） |
| `tool_result` | `tool_result` | 返回补丁 `{content?, details?, isError?}` | 记录工具结果（暂缓桥接） |
| `agent_end` / `agent_settled` | `agent_end` / `agent_settled` | — | 沉淀候选记忆 |
| `session_before_compact` | `session_before_compact` | 返回 `{cancel}` 或 `{compaction}` | 自定义压缩保留工作状态（暂缓桥接） |
| `session_shutdown` | `session_shutdown` | — | 清理会话级资源 |

### 2.1 第一版可用钩子

当前 `server` 通过 `AgentSessionWrapper` 订阅 **AgentSession 事件流**，能给出 `agent_end` 与会话生命周期；但 `before_agent_start` / `context` / `tool_call` / `tool_result` / `session_before_compact` 是 **pi 扩展层事件**（只发给 extensionRunner），现有事件流拿不到。因此：

- **可用**：`init` / `dispose` / `session_start` / `agent_end` / `agent_settled` / `session_shutdown` / `tools` / `routes`
- **暂缓桥接（接口已定义，后续 pi 降级为适配器时打通）**：`before_agent_start` 的持久消息注入（第一版改为在 `task-runtime` 调用 `wrapper.send({type:"prompt"})` 前拼接 prompt 文本）、`context`、`tool_call`、`tool_result`、`session_before_compact`
- **`tools()` 第一版不实现桥接**：注册自定义工具需要 pi SDK `customTools` 注入，属 pi 适配层工作

### 2.2 与 pi 的刻意差异

1. **注册形式**：声明式 manifest（`on: {...}` 对象），不是 pi 的 `default export function(pi)` 工厂——pi 用工厂是 jiti 热加载的需要，Yunfeng 是编译型 server。
2. **参数 schema**：`ToolDefinition.parameters` 用 JSON Schema 形状，不引入 typebox 依赖。
3. **`routes()` 是 Yunfeng 插件独有能力**：pi 扩展只能走 TUI/RPC，没有 HTTP 入口；记忆管理界面必须靠它。

## 3. 插件接口定义

见 `server/src/plugin/types.ts`（权威实现）。核心结构：

```ts
interface YunfengPlugin {
  id: string;
  dependencies?: string[];
  tools?(): ToolDefinition[];
  routes?(routes: RouteRegistrar): void;
  on?: PluginEventHandlers;
  init?(ctx: PluginContext): void | Promise<void>;
  dispose?(): void | Promise<void>;
}
```

### 3.1 注册与分发

- 静态注册：`server/src/plugins/index.ts` 的 `builtinPlugins` 数组（第一版只有 memory 插件）。
- 分发顺序：按注册顺序；单个插件抛错只记录 `console.error`，不阻断后续插件。
- `PluginContext.services` 只暴露内核稳定服务，不暴露 pi 内部对象（第一版为空，后续扩展）。

### 3.2 事件载荷要点

- `ToolCallEvent.input` 可变：就地修改影响实际执行。
- `BeforeAgentStartResult`：`message` 为持久消息（参与 LLM 上下文）、`systemPrompt` 跨处理器链式拼接。
- `ToolResultPatch`：`Partial<Pick<ToolResultEvent, "content" | "details" | "isError">>`。

## 4. 记忆插件

见 `server/src/plugins/memory/`。

### 4.1 数据模型

四类记忆（判别联合），公共元数据：`id / kind / content / source / scope / confidence / topics / projectKey / createdAt / lastUsedAt / useCount`。

| kind | 额外字段 | 说明 |
|---|---|---|
| `preference` | — | 长期习惯偏好 |
| `project_fact` | — | 仅对当前项目有效的事实 |
| `procedure` | `steps: string[]` | 「希望怎么做」的流程 |
| `episode` | `lesson: string` | 任务经验教训 |

### 4.2 写入策略（候选 + 自动确认）

- `source: "user_explicit"` → 直接 `confirmed`
- `source: "agent_inferred"` / `"observed"` → 落 `candidate`，`useCount ≥ 3` 自动转 `confirmed`
- 用户显式确认（`PATCH /memory/:id`）立即转 `confirmed`
- 同 sessionId 的 `agent_end` 只沉淀一次 episode 候选（去重），lesson 为占位文案，待 LLM 摘要能力接入后替换

### 4.3 检索

`retrieve({ topics, projectKey, limit })` 排序：`confirmed` 优先 → `project` 匹配优先 → `lastUsedAt` 新者优先 → `useCount` 加权。第一版不引入向量检索（个人规模关键词足够）。

### 4.4 持久化

`~/.yunfeng/memory/memories.jsonl`，追加写 + 变更时临时文件 + `renameSync` 原子重写，启动全量载入。与 `task-store.ts` 同一模式，不引入新依赖。数据目录可由 `YUNFENG_DATA_DIR` 覆盖（测试用）。

### 4.5 API

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/memory` | 列表 + `?q=` / `?kind=` / `?confidence=` 过滤 |
| POST | `/memory` | 显式写入（`user_explicit`） |
| PATCH | `/memory/:id` | 确认记忆 |
| DELETE | `/memory/:id` | 遗忘记忆 |

## 5. 第一版接入点

| 位置 | 改动 |
|---|---|
| `server/src/index.ts` | 启动时 `registry.initAll()`；404 前分发插件路由；`shutdown()` 时 `disposeAll()` |
| `server/src/rpc-manager.ts` | `AgentSessionWrapper.start()` 事件回调在 `agent_end` 时 `dispatch("agent_end")`；`destroy()` 时 `dispatch("session_shutdown")` |
| `server/src/task/task-runtime.ts` | `dispatchCommand` 的 `prompt` 分支在 `wrapper.send` 前 `dispatch("before_agent_start")`，聚合返回的 `message` 拼接到 prompt 文本前注入 |

## 6. 测试与验证

- `server/test/plugin.test.ts`：注册表 init/dispose、分发顺序、单插件抛错不阻断
- `server/test/memory.test.ts`：持久化/重载、检索排序、候选自动确认阈值、confirm/forget
- 验证命令：`cd server && npx tsc --noEmit && npm test`

## 7. 明确不做（后续版本）

- 动态加载（目录扫描）与外部插件分发
- `tools()` 桥接（`remember` 工具注册，需 pi 适配层）
- `context` / `tool_call` / `tool_result` / `session_before_compact` 桥接
- 前端记忆管理 UI
- task 领域插件化
