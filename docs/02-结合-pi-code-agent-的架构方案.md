# 结合 pi-code-agent 的架构方案

## 工程师

如何结合pi-code-agent，写出自己的编码agent？

## 助手

工程师，最合适的结合方式是：

> 用 `pi-code-agent` 提供模型调用、工具循环、会话树、上下文压缩和扩展机制；您自己定义任务、工作流、权限、验证闭环和界面协议。

不要把 pi-web 当模板继续复刻，也不要让前端直接理解 pi 的 RPC 命令。

## 一、边界怎么划分

| 能力 | 归属 |
|---|---|
| 模型 Provider、流式生成、Tool Loop | pi |
| `read/bash/edit/write` 等基础工具 | pi |
| SessionManager、分支、压缩 | pi |
| Skills、AGENTS.md、Extensions | pi |
| 任务状态和生命周期 | 您的 Agent |
| 编码前分析、测试、检查、提交闭环 | 您的 Agent |
| 权限、受保护路径、命令策略 | 您的 Agent |
| HTTP/SSE/Web UI 协议 | 您的 Agent |
| 长期偏好和项目记忆 | 您的 Agent |

关键是不要向前端暴露 `AgentSession` 或 pi RPC 原始结构，而是定义自己的领域协议：

```ts
type AgentCommand =
  | { type: "startTask"; prompt: string }
  | { type: "steer"; message: string }
  | { type: "followUp"; message: string }
  | { type: "abort" };

type AgentEvent =
  | { type: "taskStarted"; taskId: string }
  | { type: "textDelta"; text: string }
  | { type: "toolStarted"; name: string }
  | { type: "toolFinished"; name: string; failed: boolean }
  | { type: "approvalRequired"; approvalId: string }
  | { type: "taskFinished"; result: TaskResult };
```

以后即使替换 pi，前端和工作流也不用重写。

## 二、推荐选择 SDK，不以 RPC 为主

您当前是 TypeScript/Node 后端，因此我更推荐进程内 SDK：

```ts
createAgentSession()
createAgentSessionRuntime()
createAgentSessionServices()
createAgentSessionFromServices()
SessionManager
DefaultResourceLoader
```

原因是 SDK：

- 类型完整；
- 可以注入自定义工具、ResourceLoader 和扩展；
- 能直接订阅生命周期事件；
- 不需要复制 pi-web 的 JSONL 解析；
- 不需要调用 `RpcClient` 的私有 `send()`；
- 更适合实现自己的工作流。

RPC 更适合：

- 后端不是 Node.js；
- 必须把 Agent 放在独立进程；
- 需要进程级故障隔离；
- 需要同时运行不同版本的 pi。

因此可以把 `server-rpc` 保留为隔离方案实验，但不建议它成为当前产品内核。

本地 SDK 文档也明确把 SDK 定位为自定义 UI、自动化工作流和程序化集成的入口：[sdk.md](../pi/packages/coding-agent/docs/sdk.md)。

## 三、您的 Agent 内核只需要四个模块

建议保持简单：

```text
server/src/
  agent-runtime.ts      pi 生命周期适配
  workflow.ts           您的编码工作流
  policy.ts             权限与执行策略
  protocol.ts           自有命令和事件类型
  routes.ts             HTTP/SSE 传输
  extensions/
    workflow.ts         pi 事件拦截和自定义工具
```

### `agent-runtime.ts`

只负责：

- 创建和恢复 `AgentSession`；
- 调用 `prompt()`、`steer()`、`followUp()`、`abort()`；
- 把 pi 事件转换为您自己的 `AgentEvent`；
- 切换、分支和释放会话。

不要在这里写 Git 提交规则、TODO 规则或测试流程。

### `workflow.ts`

编码任务可以建模成显式状态机：

```text
接收目标
  → 收集项目信息
  → 明确假设与成功标准
  → 制订计划
  → 实现
  → 验证
  → 修复失败
  → 更新 TODO
  → 等待提交或自动提交
  → 完成
```

这里不一定意味着每一步都调用一次模型。它主要用于：

- 决定当前阶段允许哪些工具；
- 决定结束前必须满足哪些验证条件；
- 记录任务现在为什么停住；
- 避免模型说“完成了”就直接结束。

### `policy.ts`

策略不应只写进系统提示词。重要规则必须用代码执行：

```ts
interface ExecutionPolicy {
  canRead(path: string): PolicyDecision;
  canWrite(path: string): PolicyDecision;
  canRun(command: string): PolicyDecision;
  canCommit(context: CommitContext): PolicyDecision;
  requiresApproval(action: AgentAction): boolean;
}
```

例如：

- 写工作区外路径直接拒绝；
- `git push` 必须请求批准；
- 修改后必须更新 `TODO.md`；
- 提交信息必须满足 Conventional Commits；
- 禁止危险命令；
- Python 项目使用已有 conda 环境。

提示词负责让模型理解规则，策略层负责确保规则不被绕过。

### `extensions/workflow.ts`

pi 扩展适合做：

- 工具调用前校验；
- 工具调用后记录；
- 注入动态上下文；
- 注册 `update_todo`、`request_approval` 等工具；
- 完成任务前执行验证门禁。

示意代码：

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function workflowExtension(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event) => {
    const decision = checkToolCall(event);

    if (!decision.allowed) {
      return {
        block: true,
        reason: decision.reason,
      };
    }

    return undefined;
  });

  pi.on("agent_end", async () => {
    await recordTaskProgress();
  });
}
```

pi 已有大量扩展示例可供参考，包括权限、受保护路径、自动提交和 TODO：

- [permission-gate.ts](../pi/packages/coding-agent/examples/extensions/permission-gate.ts)
- [protected-paths.ts](../pi/packages/coding-agent/examples/extensions/protected-paths.ts)
- [auto-commit-on-exit.ts](../pi/packages/coding-agent/examples/extensions/auto-commit-on-exit.ts)
- [todo.ts](../pi/packages/coding-agent/examples/extensions/todo.ts)

参考它们的机制，但规则应由您的 `policy.ts` 提供。

## 四、最小运行代码

第一版可以先创建单个持久化会话：

```ts
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

export async function createCodingAgent(cwd: string) {
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    additionalExtensionPaths: [
      new URL("./extensions/workflow.js", import.meta.url).pathname,
    ],
    systemPromptOverride: () => buildSystemPrompt(cwd),
  });

  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    resourceLoader,
    sessionManager: SessionManager.create(cwd),
    tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
  });

  return session;
}
```

然后用一个薄适配层包装：

```ts
export class CodingAgent {
  constructor(private readonly session: AgentSession) {}

  start(prompt: string): Promise<void> {
    return this.session.prompt(prompt);
  }

  steer(message: string): Promise<void> {
    return this.session.steer(message);
  }

  followUp(message: string): Promise<void> {
    return this.session.followUp(message);
  }

  abort(): Promise<void> {
    return this.session.abort();
  }

  dispose(): void {
    this.session.dispose();
  }
}
```

当需要新建、恢复、切换和分支会话时，再换成 `AgentSessionRuntime`。不要一开始自己实现完整会话管理；官方模式可以参考：[13-session-runtime.ts](../pi/packages/coding-agent/examples/sdk/13-session-runtime.ts)。

## 五、您的工作流如何进入上下文

建议分成三层，避免一个巨大系统提示词。

### 稳定身份

放在系统提示词：

- Agent 是谁；
- 工作原则；
- 工具使用基本规则；
- 输出风格；
- 完成的定义。

### 项目规则

继续使用 `AGENTS.md`：

- 技术栈；
- 构建命令；
- 编码规范；
- 项目特有边界。

pi 的 `DefaultResourceLoader` 能自动从当前目录向上发现这些文件。

### 当前任务状态

动态注入：

```ts
interface TaskContext {
  objective: string;
  assumptions: string[];
  successCriteria: string[];
  currentStep: string;
  completedSteps: string[];
  verification: VerificationResult[];
  blockers: string[];
}
```

不要把任务状态只保存在聊天文本中，否则压缩上下文后容易失真。任务状态应单独持久化，必要时重新注入。

## 六、把“完成”变成程序判断

自己的编码 Agent 与普通聊天 Agent 最大的差别，应该是完成条件由 Runtime 判断。

```ts
function canCompleteTask(task: TaskState): boolean {
  return (
    task.changedFilesReviewed &&
    task.requiredTests.every((test) => test.passed) &&
    task.todoUpdated &&
    task.unresolvedErrors.length === 0
  );
}
```

当模型声称完成时：

1. Runtime 检查验证结果；
2. 不满足则向会话追加 follow-up；
3. 明确告诉模型缺少什么；
4. 继续运行；
5. 全部通过后才产生 `taskFinished`。

这才是真正让 Agent 适应您的工作流。

## 七、对现有项目的建议

建议不要继续同时完善两套后端。下一阶段可以这样做：

1. 保留 `server-rpc` 作为隔离实验，不继续补齐 pi-web API。
2. 将 `server` 中对 pi 的调用收缩到一个 `PiAgentRuntime`。
3. 删除对 `extensionRunner`、私有状态和伪造 UI Context 的依赖。
4. 定义自己的 `AgentCommand`、`AgentEvent` 和 `TaskState`。
5. 先完成一个垂直工作流：修改代码 → 执行测试 → 更新 TODO → 生成提交。
6. 用集成测试验证工作流，而不只是验证模块可以加载。

第一处需要工程师确认的技术选择是：**是否接受以“进程内 SDK + 自有协议”为主架构，把 `server-rpc` 暂时降为实验方案？**

确认这一点后，才能继续决定是改造现有 `server`，还是建立一个更小的 Runtime 骨架。
