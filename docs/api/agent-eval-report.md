# Agent Eval 报告导入

## 用途与入口

由独立 [agent-eval](https://github.com/Linmoqian/agent-eval) 核心生成 JSON；云枫工作台“Agent 评估”或 `/evaluation` 读取展示。复用既有页面路由与本地文件选择器，不新增网络 API。详细契约源为 agent-eval `core/report.ts`，云枫通过 `features/evaluation/report.ts` 校验展示所需字段。

## 输入与返回

文件为 UTF-8 JSON，最大 2 MiB。版本 `schemaVersion: 1`，报告必填 `id`、`createdAt`（可解析日期）、`source`（`benchmark` / `fixture`）、`evaluator`、`repeats`（1..100）和非空 `runs`（最多 2000 条）。

每次运行必填：`id`、`candidate`、`label`、`model`、`repeat`、`condition`、`task`、`status`、`verdict`、`durationMs`、`modelCalls`、`toolCalls`、`usage`。

- `task`：`task_id`、可选 `title`、`category`、`instruction`、`tools`。其余任务数据只读保留。
- `status`：`completed` / `error` / `cancelled` / `timed_out`。
- `verdict`：`status` 为 `passed` / `failed` / `ungraded`，`reason` 为独立验收依据；未完成运行不能通过。
- 调用测量：`name`、非负有限 `durationMs`、`status`（`succeeded` / `failed`）、可选 `error`。
- `usage`：非负有限 `promptTokens`、`completionTokens`、`totalTokens`。
- 可选 `result`：`finalAnswer`、`trace.steps`；只展示工具与观测，内部思考不渲染。

`parseEvaluationReport(raw)` 成功返回只读展示使用的报告；失败抛出中文错误，页面保留原已载入报告。拒绝重复运行 ID、重复任务/候选/条件/轮次组合、越界轮次和非法指标。不兼容版本不会静默转换。

## 权限与副作用

文件读取由用户显式选择触发，不上传，不执行工具，不调用模型，不写入任务、会话或科研数据库。页面状态仅承载当前查看结果，重新打开需再次导入；原报告文件是持久结果来源。示例按钮载入打包的固定模型替身报告，持续显示“示例”标识。

## 比较与兼容性

报告 `condition` 用于划分同条件运行；指纹由核心生成，包含任务、模型名称、候选配置和验收器。模型具体参数、工具实现及运行环境一致性由评估调用方负责。页面对导入报告作结构校验，不能认证其生成者或真实性。

通过数分母包括全部已记录样本；未评分单独标注。耗时包含初始化、执行、验收和清理。费用尚未记录时展示“未提供”。画布按可用宽度展示当前附近轮次，其余轮次通过详情选择器访问，避免大量节点压缩文字。

更改报告主版本时需同步核心、云枫校验器、示例与测试。当前验收使用固定模型替身，不构成真实 Agent 能力排名。
