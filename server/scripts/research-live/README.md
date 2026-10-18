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
