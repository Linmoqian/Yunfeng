# 本地科研 Runtime

架构依据见 [Pi SDK 与自研 Runtime 的边界](../../../docs/development/2026-10-18-research-architecture.md)。Pi SDK 提供嵌入式模型与会话能力，科研的长期调度、任务树、执行、验收、记忆和恢复由 Yunfeng 自研模块负责。

`ProjectCore` 实现 `observe → plan → execute → reflect`，`ResearchRuntime` 管理检查点与事件唤醒，`ResearchService` 接入现有任务、审批、记忆和 SSE。[Decision Layer](decision/README.md) 由结构化模型提案和规则组成，维护目标树、排序、预算与下一节点；Pi 为该节点规划并反思。模型每次使用无工具的临时会话，配置来自 Lin SDK 适配层；资源加载限定为显式 skill 与宿主内置事件桥。

`project.ts` 负责真实文件、Git 与数值验收，`validation.ts` 校验模型输出，`executor.ts` 管理受控写入和无 shell 命令。[Hook 层](hooks/README.md) 合并生命周期、文件、授权与作业事件，`context.ts` 重新读取事实后构建上下文，再由决策层判断价值。Runtime 每个事件批次运行一次，没有定时模型轮询；繁忙时保留通知，等待期间保留监听。

模型输出不符合 JSON 或阶段结构时，在同一无工具会话内最多纠正一次，共用该阶段 120 秒时限；认证与服务错误直接失败。写入 JSON 文件也必须提交字符串内容。滚动提案可以引用已有节点 ID 更新评分，原目标、父节点、类型、尝试次数与结果继续保留。

科研检查点与节点关系由 TaskStore 在 `research.sqlite` 的同一事务保存，旧 JSON 仅作迁移备份；记录保存在任务事件，候选经验保存在 MemoryStore。重启后未知作业暂停，不重放命令；工程师继续后先反思中断结果。默认每次最多 20 轮，继续时再授予至少 20 轮；最多 4 个活跃任务/作业，每个命令作业最多 30 分钟。

计划、评分与原始作业输出按工具角色保存。反思与后续探索问题留在检查点和候选记忆中；对话只播报实际实验结论、失败后的处理事项与一次最终验收通知，无副作用的中间核验不追加反思消息。模型摘要要求两三句话，保留实测差距和局限。旧快照的固定过程前缀兼容映射为工具角色；客户端隐藏历史反思的自动追问、连续同文结论和紧接实验结论的完成流程复述，原事件不改写。状态卡展示阶段进展，授权与错误继续直接显示。

科研状态胶囊提供“研究分支关系图”入口，在中央画布显示 `autonomy.decision` 中的研究目标、父子关系、当前节点和真实验收状态。节点详情按需展开，并明确标记评分、成功率及成本为估计值；画布支持拖动、缩放、全图适配和返回对话。任务快照更新不会重置视角，前端不修改目标树或推断额外依赖；异常关系保留节点并提示，不补造连线。

默认可写项目 `.lin/experiments/` 内文件，命令需要完整参数预授权或具体计划确认。该权限清单不是操作系统沙箱，获准程序具有本机权限。POSIX 使用进程组回收子进程；Windows 当前仅保证直接子进程退出，后代进程尚需原生验收。

核心验证：在 `server/` 执行 `pnpm exec tsx --test test/research-runtime.test.ts test/research-decision.test.ts test/research-hooks.test.ts`。测试使用可控决策，实际执行临时项目中的 Node 作业、文件事件与取消，覆盖闭环、授权、路径限制、恢复、规则选点、Hook 合并与关闭、无行动价值时继续等待；另以实际 Pi SDK 和本地模拟模型接口核对 decide/plan/reflect 的隔离路径。这不代表真实模型或训练质量验收。公开契约见 [科研任务 API](../../../docs/api/2026-10-15-research-runtime.md)。

创建科研任务可传 `skills: ["experimental-design"]`，最多五个名称。按项目 `.lin/skills`、项目 `.agents/skills`、Lin Agent 的 `skills` 目录依次解析；每个选中目录须有同名、有效的 `SKILL.md`，单文件最多 32 KiB、正文总计最多 64 KiB。路径越界、无效元信息、缺失和重复选择会拒绝创建。只注入选中的说明文本，不运行其脚本或自动加载引用资源；所有实验副作用继续经过 execute。名称保存到检查点，恢复时重新核验文件，缺失或失效会停止对应模型阶段。

`resources.ts` 使用空的内存资源设置调用 SDK loader，仅装载选中 skill 和 `PiResearchBridge` 内置扩展，避免解析用户配置的资源包。桥将 `agent_start/agent_settled` 转为带任务、临时会话与阶段来源的本地通知；这些生命周期通知不进入模型唤醒队列。Pi 扩展可通过共享的 `pi.events.emit("research:changed", {paths:["control.json"]})` 报告变化，受信本地适配器可调用 `service.notify(taskId, ["control.json"])`。只接收当前观察范围内最多八个文件；通知经 Hook 合并后重读文件，事实未变不消费模型轮次。返回 true 表示入队，不能代表实验成功。暂停、关闭与任务结束回收事件订阅，恢复时创建新桥。没有开放任意扩展文件加载或 HTTP 事件注入接口。

新增资源验证：在 `server/` 执行 `pnpm exec tsx --test test/research-resources.test.ts test/research-hooks.test.ts`。资源集成测试用实际 Pi SDK、本地模型替身与真实源码 gzip 作业验证选择、生命周期、无变化通知过滤、执行、反思、组件发布和暂停后重建恢复；不代表真实模型决策质量验收。

真实模型验收记录见 [源码压缩实验验收](../../../docs/development/2026-10-15-research-acceptance.md)。默认模型与凭据可由仓库根 `.env` 提供，加载规则见 [Server 说明](../../README.md)；不动态读取 `.pi`。模型认证失败须修复配置后手动继续；模型列表中的“可用”只表示本地配置被识别，不代表上游认证成功。

选择性 skill 和 Pi 事件桥已通过 [2026-10-18 真实模型闭环验收](../../../docs/development/2026-10-18-research-live-acceptance.md)：两进程暂停恢复、32 次同事实通知过滤、实际压缩和反思、组件报告及作业去重。显式运行入口见 [research-live](../../scripts/research-live/README.md)，默认测试不会请求真实模型。

性能路径：TypeScript 保留 Runtime、Hook、Pi 事件桥和任务编排；桌面支持能力2时，观察文件合并为一次 Rust 请求，连续写入与末尾验收合并执行，命令和组件步骤截断批次。Rust 通过固定缓冲发送 JSON，减少细碎系统调用；不使用共享内存或宣称零拷贝。旧宿主能力1继续逐项请求，独立 Server 保留 Node 实现，通道失败不重放或回退。组件更新复用既有适配，只有必要实验命令启动子进程，stdout/stderr 走管道并限制输出长度。模型规划要求选择最少步骤，避免用 shell、Node 或 Python 包装已有原生动作。边界和部分提交语义见 [科研执行契约](../../../docs/api/2026-10-18-research-execution.md)。

`model-environment.ts` 在活跃任务内复用 SDK 模型目录和设置；每阶段核对 auth、模型目录、全局及项目设置的文件身份、大小、纳秒时间戳和环境摘要。变化后重载，加载期间变化最多重试一次；取消不返回缓存。每阶段仍重新验证所选 skill、建立独立无工具会话并回收扩展，暂停恢复后使用新环境。

科研检查点采用节点增量更新；事件游标直接更新 SQLite 检查点字段，不再复制整棵树。提交失败不更新内存或通知订阅者。进程内订阅传对象，SSE 对同一事件只编码一次，再分发给所有客户端；持久化日志继续独立写入。外部命令启动、磁盘提交和桌面通道仍有各自开销，不能将进程内通知延迟当作端到端 IPC 延迟。测量入口见 [本地基准](../../scripts/research-live/README.md)，数字及适用范围见 [性能验证记录](../../../docs/development/2026-10-18-research-performance.md)。
