# 科研文献检索闭环验收

2026-10-19 在本机独立 Server 验证，使用现有 Pi SDK 与 Lin 模型配置，无替身模型；项目默认配置为 zai / glm-5.3-flash。任务未固定模型 ID，脚本阶段记录不是底层 HTTP 请求计数。没有启动第二个桌面实例，也没有修改工程师已有会话。

## 实现与边界

复用 `execute → read_horizon(literature, query, path)`，完整计划确认后查询 Europe PMC 与 Crossref，再通过既有文件执行器保存来源，`update_component` 发布轻量胶囊。没有新增服务、依赖或模型直调工具。契约见 [文献视界检索](../api/2026-10-19-research-literature.md)。

两个索引不等于两个独立科学证据。按 DOI/标题去重，以不同作品、完整作者姓氏不重合和存在不同摘要筛选候选；模型再比较摘要共同点、差异与局限，保留原始链接。独立数据、版本与转引关系仍须全文核验。引用校验只保证链接属于实际候选，不能自动证明自然语言比较正确。

## 成功记录

证据目录：`~/.codex/visualizations/2026/10/19/literature-loop-04/`。保留 SQLite、两个检查点、`trace.jsonl`、真实索引报告、`result.json`、`reflection-audit.json` 和折叠/展开截图。复现入口见 [真实模型脚本](../../server/scripts/research-live/README.md)。

查询：`soybean pod detection deep learning`。两个索引均成功，报告保留 6 篇去重文献、4 组候选；`independent_candidates=2` 表示至少有两篇可比较的候选来源，不表示只有两组候选，更不证明数据独立。

| 环节 | 实际核验 |
| --- | --- |
| Hook 等待 | 控制文件 ready=false 后等待；16 次相同事实通知不新增模型调用、事件或作业 |
| 暂停 | 暂停后修改 ready=true；通知不启动检索 |
| 服务重建 | prepare 与 resume 是两个不同 Node 进程，共用原 SQLite；recover 保持暂停，显式继续后规划 |
| 授权 | 审批前报告不存在；验收程序只批准固定公开查询和组件发布，禁止模型增加命令或伪造报告 |
| execute | 一个执行节点、一次尝试；检索与组件发布各一次完成回执，两个索引各请求一次，无重试 |
| 反思 | 执行反思与最终验收反思均引用实际候选组内两篇 DOI 来源，比较方法、对象和证据局限 |
| 失效授权 | 任务完成后再次使用原批准 ID 返回 false |
| 恢复投影 | 完成后文献视界仍返回 6 篇来源，来源取自持久化组件和节点报告 |
| 静默 | 重建未继续、暂停及完成后的静默窗口不新增执行；此验证窗口为各1.5秒，不代表长时间稳定性测试 |

成功轮 prepare 调用真实决策一次；resume 调用决策、规划和两次反思，共四个阶段。检索步骤耗时 3730.38ms，报告发布 3.21ms，包含仲裁、联网/文件和反馈开销，不是纯计算或 Rust IPC 基准。恢复阶段模型耗时分别约 32.47s、17.15s、82.17s、78.23s。

成功轮最终比较 Agronomy 的荚果性状图像表型/GWAS（`10.3390/agronomy16151454`）与 DLML-PC 的整株荚型检测计数（`10.3389/fpls.2025.1583526`），明确仅依据索引摘要、全文和数据独立性未核验。论文数值没有被当成本地实验实测指标。

该轮执行反思曾将“2篇候选来源”误称“2组候选”，报告与胶囊的事实数量不受影响。随后反思上下文显式区分候选来源数和已保留候选组数，要求数量只由胶囊呈现；在同一份真实报告上另调用真实模型反思，`reflection-audit.json` 验证两篇真实引用、摘要比较与局限，未再复述数量，没有重新检索或修改原任务记录。

## 失败记录与修复

- loop-01：测试把控制文件放在尚未纳入观察的根目录，首批通知产生必要的首次观察，静默断言失败。调整为自动观察的实验目录后重跑，没有将首次观察认作无效唤醒。
- loop-02：检索成功，但模型反思只复述数量，没有两篇引用。补充有界摘要上下文及实际候选引用校验，沿用 SDK 一次纠错机制；未将该轮记为通过。
- loop-03：模型已完成带引用的摘要比较；最终验收替换 lastResult 后，文献视界丢失来源投影。改为从已持久化的组件/节点报告恢复，增加最终验收覆盖回归，随后 loop-04 全流程通过。

失败目录和原模型输出保留，没有替换模型结果或补造报告。

## 自动化与界面

实际执行并通过：

```sh
pnpm --dir server run build
pnpm --dir server exec tsx --test test/research-literature.test.ts test/research-runtime.test.ts test/research-tools.test.ts test/research-feedback.test.ts test/research-lifecycle.test.ts
pnpm --dir app/desktop exec tsc --noEmit
pnpm --dir app/desktop exec vitest run tests/researchReport.test.tsx tests/researchMessage.test.tsx --environment jsdom
pnpm check:docs
```

后端核心26项、前端9项通过。涵盖授权与撤权、缓存避免重复联网、取消无落盘、部分失败、同作品/重合作者排除、响应边界、真实引用归属、完成后的投影恢复以及生命周期回归。

浏览器使用成功轮持久化快照渲染实际 ResearchReport / ResearchMessage 组件，核对文献数、候选与验收胶囊、默认折叠、展开滚动与 DOI 链接。来源详情禁止外部图片，保留链接；没有进行桌面原生点击全链路验收。未修改 Rust，不将本次独立 Server 文件路径验收计作 Rust 宿主验收。
