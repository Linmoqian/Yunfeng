# Agent 评估

工作台“添加或管理工具 → Agent 评估”；独立审阅入口 `/evaluation`。复用科研图的 `BranchNode`、React Flow、公共 `Capsule`、`Details`、Motion 和现有主题。

评估核心由 [agent-eval](https://github.com/Linmoqian/agent-eval) 维护。运行器生成 JSON 后在工作台导入；云枫只读展示，不执行报告中的内容，不启动第二个服务。报告原文件负责持久保留，关闭页面后重新导入。当前未提供工作台内启动评估或持续订阅运行的接口。

同条件按报告的 `condition` 指纹分组。指纹对应任务、模型名称、Agent 配置和验收器；运行者仍需保证模型参数、工具实现与环境一致。失败、超时、取消、未评分样本均保留；通过数的分母包括全部已记录运行。费用无记录时显示“未提供”。

`fixtures/comparison.json` 来自实际运行的固定模型替身，只有管线验收意义。两种架构各运行三轮，不是实际 LLM 能力排名。更新示例（在 agent-eval 仓库先 `npm run build`）：

```bash
node examples/compare.mjs ../Yunfeng/app/src/features/evaluation/fixtures/comparison.json
```

边界约定：agent-eval `BenchmarkReport.schemaVersion=1`，文件不超过 2 MiB、2000 个样本；`report.ts` 拒绝版本、指标、重复轮次等非法输入。报告中的任务标题由任务定义提供，缺失时展示标识，不凭空生成概述。原始思考不在 UI 中展示，最终答案、工具边界和观测记录默认折叠。导入内容不上传，不写入会话或科研数据库。
