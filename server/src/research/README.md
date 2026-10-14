# 本地科研 Runtime

`ProjectCore` 实现 `observe → plan → execute → reflect`，`ResearchRuntime` 管理检查点与事件唤醒，`ResearchService` 接入现有任务、审批、记忆和 SSE。[Decision Layer](decision/README.md) 由结构化模型提案和规则组成，维护目标树、排序、预算与下一节点；Pi 为该节点规划并反思。模型每次使用无工具、无扩展的临时会话，配置来自 Lin SDK 适配层。

`project.ts` 负责真实文件、Git 与数值验收，`validation.ts` 校验模型输出，`executor.ts` 管理受控写入和无 shell 命令。结果由完成事件送回 Runtime，等待期间没有模型轮询。文件等待监听项目根及最多三个观察路径的既有父目录，目录监听不递归。

检查点保存在 TaskStore，记录保存在任务事件，候选经验保存在 MemoryStore。重启后未知作业暂停，不重放命令；工程师继续后先反思中断结果。默认每次最多 20 轮，继续时再授予至少 20 轮；最多 4 个活跃任务/作业，每个命令作业最多 30 分钟。

默认可写项目 `.lin/experiments/` 内文件，命令需要完整参数预授权或具体计划确认。该权限清单不是操作系统沙箱，获准程序具有本机权限。POSIX 使用进程组回收子进程；Windows 当前仅保证直接子进程退出，后代进程尚需原生验收。

核心验证：在 `server/` 执行 `pnpm exec tsx --test test/research-runtime.test.ts test/research-decision.test.ts`。测试使用可控决策，实际执行临时项目中的 Node 作业、文件事件与取消，覆盖闭环、授权、路径限制、恢复、规则选点与失败限制；另以实际 Pi SDK 和本地模拟模型接口核对 decide/plan/reflect 的隔离路径。这不代表真实模型或训练质量验收。公开契约见 [科研任务 API](../../../docs/api/2026-10-15-research-runtime.md)。
