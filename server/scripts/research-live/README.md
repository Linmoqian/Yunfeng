# 科研真实模型验收

显式调用项目 `.env` / `.lin/agent` 的现有模型，产生真实模型请求与费用。默认测试不会运行此入口。不打印或复制模型凭据；请求证据只保留模型名、skill 标记、工具数量与 HTTP 状态。

从 `server/` 执行，目录必须尚不存在：

```sh
pnpm exec tsx scripts/research-live/prepare.ts /absolute/path/to/new-acceptance
pnpm exec tsx scripts/research-live/verify.ts /absolute/path/to/new-acceptance baseline
pnpm exec tsx scripts/research-live/verify.ts /absolute/path/to/new-acceptance optimize
```

第一个进程确认等待不轮询、32 次同事实通知不调用模型、真实基线执行和反思、暂停时修改复核状态不执行。退出后第二个进程从同一数据库恢复，检查暂停与 skill 选择，手动恢复后完成优化、组件报告和最终反思。两次命令各有阶段超时，失败保留检查点，不覆盖已有实验；失败后先检查产物和原因。

选中项目 `experimental-design` 和实验方法 skill；另放未选中 skill、扩展作为隔离哨兵。模型无内置工具；只能生成计划，由现有 Runtime 的 execute 执行。写权限仅覆盖配置子目录，指标由唯一授权的 `benchmark.mjs` 生成。脚本拒绝重复阶段和覆盖报告。

输出保留 `trace.jsonl`、两个检查点、SQLite 数据、实验日志、压缩产物、`result.json` 和 `audit.json`。验收断言检查阶段各执行一次、节点尝试次数为 1、真实解压一致、改善至少 1%、最终实测验收通过。审计同时核对 SDK 生命周期、真实事件来源、六个静默窗口、两个进程和三条独立候选记忆。此入口验证后端与组件数据快照，不代表桌面动画或跨机器验收。

## 本地性能基准

在 `server/` 执行：

```sh
pnpm exec tsx scripts/research-live/performance.ts /absolute/path/to/performance.json
```

创建并清理独立临时夹具，无模型网络请求。测量 Pi 通知调度、项目观察、选中 skill 加载、模型目录准备、100 节点检查点及事件提交、原生文件写入和实际 Node 命令启动，输出首轮与热路径 p50/p95。模型环境测试只测配置加载，不包含模型推理；通知测试只测同进程桥到 Hook，不包含文件回读、Git、持久化、桌面通信或 UI 呈现。观察夹具不是 Git 仓库，不能代表大型仓库扫描。短基准受机器负载影响；进程启动不因环境复用而消失。

## Rust 对照

新增独立 [Rust 科研核心](../../../app/src-tauri/research-kernel/README.md)，构建并执行后在全新目录生成 `comparison.json`、SQLite 和日志。`native-worker.mjs` 复用当前 `server/dist` 生产代码，运行前需要 `pnpm --dir server build`；`native-compare.ts` 记录进程内调用、双方 JSON 管道完整往返、核心内部计时、冷启动及采样 RSS。默认每项 5 次预热和 100 次测量，无模型请求。脚本 RSS 与二进制定位按 macOS/Linux 设计，当前仅验收 macOS arm64。详见 [结果与限制](../../../docs/development/2026-10-18-research-rust-comparison.md)。

## 固定复杂工作流对照（无 LLM）

先构建 Server 与 Rust release，在 `server/` 执行：

```sh
pnpm exec tsx scripts/research-live/workflow-compare.ts /absolute/path/to/new-workflow-comparison
```

固定执行 3 轮，每轮依次完成 Node 进程内、Node 管道、Rust 管道三组相同的 36 环节流程；每轮轮换组别先后，无预热、无随机步骤、无模型请求。包含 100 节点落库、等待条件、脚本注入 Hook 输入、固定规则决策、配置写入、真实样本文件统计、指标验收、反思候选落盘、暂停、实例关闭恢复与第二阶段筛选。统计夹具用 256 条确定样本；它不是训练实验或算法质量评价。Node 管道与 Rust 管道均真退出并重启；Node 进程内只重建领域实例。暂停没有人为等待时间。

每个环节记录 UTC 系统时间、`Date.now()` 墙上时间差，以及 `process.hrtime.bigint()` 系统单调时钟纳秒差。毫秒墙上时钟可能记录 0，耗时对照使用单调时钟；Rust 内部耗时另外记录，主表始终包含序列化和管道完整往返。规则决策/反思由共用脚本固定返回，表中标记“共用脚本”，不代表两种语言或真实模型的推理速度。夹具业务时间固定以核对跨语言结果，计时时钟始终来自真实系统。

`workflow-comparison.json` 保留全部 3 轮逐步结果、范围、中位数、源码和二进制指纹；`workflow-comparison.md` 是完整逐步表。报告另列扣除生命周期后的耗时，含脚本校验的总时间和环节累计分开。计时过程中不插入证据文件写入；各组完成后保留 `timings.json`、失败时部分计时、实验文件、SQLite 和事件日志。每个环节的结果均跨组核对，检查暂停前后状态一致、两阶段实际统计、事件连续及双方数据库交叉读取。固定编排没有运行生产 Pi Hook/决策桥或完整科研调度器。详见 [本次记录](../../../docs/development/2026-10-18-research-fixed-workflow.md)。
