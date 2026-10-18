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
