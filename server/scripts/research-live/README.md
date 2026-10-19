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

新增独立 [Rust 科研核心](../../../app/desktop/src-tauri/research-kernel/README.md)，构建并执行后在全新目录生成 `comparison.json`、SQLite 和日志。`native-worker.mjs` 复用当前 `server/dist` 生产代码，运行前需要 `pnpm --dir server build`；`native-compare.ts` 记录进程内调用、双方 JSON 管道完整往返、核心内部计时、冷启动及采样 RSS。默认每项 5 次预热和 100 次测量，无模型请求。脚本 RSS 与二进制定位按 macOS/Linux 设计，当前仅验收 macOS arm64。详见 [结果与限制](../../../docs/development/2026-10-18-research-rust-comparison.md)。

## 固定复杂工作流对照（无 LLM）

先构建 Server 与 Rust release，在 `server/` 执行：

```sh
pnpm exec tsx scripts/research-live/workflow-compare.ts /absolute/path/to/new-workflow-comparison
```

固定执行 3 轮，每轮依次完成 Node 进程内、Node 管道、Rust 管道三组相同的 36 环节流程；每轮轮换组别先后，无预热、无随机步骤、无模型请求。包含 100 节点落库、等待条件、脚本注入 Hook 输入、固定规则决策、配置写入、真实样本文件统计、指标验收、反思候选落盘、暂停、实例关闭恢复与第二阶段筛选。统计夹具用 256 条确定样本；它不是训练实验或算法质量评价。Node 管道与 Rust 管道均真退出并重启；Node 进程内只重建领域实例。暂停没有人为等待时间。

每个环节记录 UTC 系统时间、`Date.now()` 墙上时间差，以及 `process.hrtime.bigint()` 系统单调时钟纳秒差。毫秒墙上时钟可能记录 0，耗时对照使用单调时钟；Rust 内部耗时另外记录，主表始终包含序列化和管道完整往返。规则决策/反思由共用脚本固定返回，表中标记“共用脚本”，不代表两种语言或真实模型的推理速度。夹具业务时间固定以核对跨语言结果，计时时钟始终来自真实系统。

`workflow-comparison.json` 保留全部 3 轮逐步结果、范围、中位数、源码和二进制指纹；`workflow-comparison.md` 是完整逐步表。报告另列扣除生命周期后的耗时，含脚本校验的总时间和环节累计分开。计时过程中不插入证据文件写入；各组完成后保留 `timings.json`、失败时部分计时、实验文件、SQLite 和事件日志。每个环节的结果均跨组核对，检查暂停前后状态一致、两阶段实际统计、事件连续及双方数据库交叉读取。固定编排没有运行生产 Pi Hook/决策桥或完整科研调度器。详见 [本次记录](../../../docs/development/2026-10-18-research-fixed-workflow.md)。

## TS 编排与 Rust 执行联调

先构建 Server；在仓库根显式运行实际 Rust 私有通道与 TS ResearchService 的闭环验收：

```sh
cargo test --locked --manifest-path app/desktop/src-tauri/Cargo.toml hybrid_typescript_orchestration -- --ignored --nocapture
```

该入口不启动窗口、不读取真实团队/任务数据、不请求真实模型；Rust 测试注入现有桌面连接，TS 服务运行真实 Hook、权限、作业、反思与暂停重建恢复。两阶段文件写入和验收经过 Rust，规则替代模型，统计与指标为固定本地夹具。Node 只重建服务实例，Rust 通道宿主持续存在；不是桌面进程重启或 Pi 模型验收。

固定工作流可增加 `hybridSingle`、`hybridPipe` 两组：Node 工作进程继续编排和持久化，文件调用通过真实桌面私有 TCP 到 Rust，包含父子管道与 Rust TCP 两次进程边界。两组使用同一宿主、响应缓冲和 TS 代码，仅能力标识分别为1（逐项）与2（批量）。普通基线组清除原生能力标识，防止被父进程配置污染。先构建 Server 和独立 Rust release worker，在仓库根执行 release 宿主测试，输出目录必须不存在：

```sh
YUNFENG_ACCEPTANCE_OUTPUT=/absolute/path/to/new-hybrid-comparison cargo test --release --locked --manifest-path app/desktop/src-tauri/Cargo.toml hybrid_workflow_three_round_comparison -- --ignored --nocapture
```

完整执行3轮、每组36环节，五组共540条记录，无真实 LLM，保留原环节ID与产物。组顺序轮换，每环节保留系统时间和单调时钟耗时；工作进程逐环节报告原生请求提交计数，固定流程每轮单项28次、批量18次，并断言计数。计数包含失败尝试，成功基准中与实际私有请求对应。

测试宿主把连接仅注入混合组，不将令牌写入报告；记录宿主二进制指纹与 `hybridRustProfile`。应确认其为 release；省略 --release 将变为 debug，不能混作同构建性能对比。本基准与上一条服务闭环是不同验证范围，报告 scope 有明确说明。三轮不足以估计稳定尾延迟，不外推真实模型或训练收益。

## 核心工具真实 Rust 联调（无 LLM）

构建 Server 后，在仓库根执行：

```sh
cargo test --locked --manifest-path app/desktop/src-tauri/Cargo.toml research_core_tools_authorization -- --ignored --nocapture
```

`core-tools-check.mjs` 由 Rust 测试注入私有通道，运行范围读取、唯一原文修改、结构化 argv PTY 和视界投影；核验授权前无修改/启动、暂停后真实 PID 退出、授权失效、恢复后新计划批准、真实报告和组件验收、未知作业恢复回收。输出仅汇总计数和状态；临时项目自动清理，不读取真实任务数据、不请求 LLM。宿主 Runtime 输出与桌面使用同一缓存，脚本不启动窗口，不代表 UI 呈现验收。

## 四工具真实模型、取消与两进程恢复

先构建 Server，在仓库根执行。此入口会产生真实模型费用，默认测试跳过；目录必须尚不存在，失败证据也不覆盖：

```sh
pnpm --dir server build
YUNFENG_RESEARCH_LIVE=1 YUNFENG_ACCEPTANCE_OUTPUT=/absolute/path/to/new-core-tools cargo test --locked --manifest-path app/desktop/src-tauri/Cargo.toml research_core_tools_real_model_loop -- --ignored --nocapture
```

Rust 测试宿主注入实际私有通道，依次启动两个 Node 进程。第一个由真实 Pi 决策等待 Hook，提交按行读取、ideas 视界、精确修改、结构化 argv 终端和报告发布计划；验收器先检查原始计划符合实验约束，再批准。实验启动后真实暂停并确认 PID 回收，旧授权失效。第二个进程从同一 SQLite 恢复，显式继续后反思取消结果、重新规划与授权；程序执行真实 gzip、独立解压核验，发布报告，完成实测验收及反思。

模型自行选择压缩级别；验收器不替换模型输出、不补写实验指标。实验程序用独占尝试锁阻止重复启动，运行日志必须只有 attempt=1、2 各一次。记录七个各3秒的静默窗口、32次同事实通知、三条独立作业经验；一次取消加一次成功，不将取消后的明确重试算成重复执行。

`trace.jsonl` 在仲裁入口记录每次调用，包含工具分类、宿主固定权重、是否派发、成败和单调时钟耗时；不依赖最近64条回执缓存。统计包含观察与验收的内部读取，`horizon` 同时包含读取目标树及发布现有科研组件。耗时包含权限核验、仲裁等待、Rust 通道往返、工具本身和少量观测开销；终端包含真实进程运行、取消回收及输出读取。模型阶段另计，不混入工具耗时。这是闭环实测记录，不是纯 Rust 内核基准或稳定尾延迟评估。

保留两个检查点、两进程 `*-metrics.json`、实验日志、SQLite、`result.json` 及独立 `audit.json`。可不调用模型重新审计：

```sh
node server/scripts/research-live/core-tools-audit.mjs /absolute/path/to/completed-core-tools
```

验收使用实际 Rust PTY Runtime，不启动窗口，不代表桌面可见性或动画验收。当前未配置桌面组件端口，视界验证 ideas 目标树与 research 报告数据；文献、文稿和训练模块的真实外部服务不在本实验范围。

## 真实模型文献检索闭环

在 server/ 显式运行（使用本机 Lin 模型配置，产生真实模型费用与公开索引请求）：

```sh
pnpm exec tsx scripts/research-live/literature-live.ts /absolute/path/to/new-literature-check prepare
pnpm exec tsx scripts/research-live/literature-live.ts /absolute/path/to/new-literature-check resume
```

两个进程分别验证控制文件 Hook 等待、同事实去重、暂停后事实变化和服务重建恢复。resume 仅自动批准固定公开查询与报告发布，拒绝模型新增命令或写文件；真实索引报告、两个实际来源引用、胶囊快照、反思和单次执行由脚本核对。trace.jsonl、检查点和 result.json 留存原结果及耗时；失败保留检查点，不伪造数据或自动改写模型输出。此验收只确认检索与对比流程，不证明论文科学结论、全文证据或跨机器恢复。
