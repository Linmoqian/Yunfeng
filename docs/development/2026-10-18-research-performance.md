# 科研本地链路性能验证

日期：2026-10-18。环境：Apple M4 / macOS arm64 / Node v26.7.0 / Pi SDK 1.2.0。对比提交 d60ed4b 与本次实现；相同临时夹具、顺序执行，不含模型网络和 UI。测量方法见 [基准入口](../../server/scripts/research-live/README.md)。

## 实现

- Pi 通知从固定 50 ms 延时改为微任务合并；文件观察与 Hook 的两个合并窗口各从 50 ms 缩为 8 ms。保留有界队列、繁忙背压、暂停关闭与事件去重。
- 同事实通知只回读所指文件，直接结束本轮，不调用 Git、不保存阶段检查点、不触发 UI 状态切换。变化事实仍完整观察并核验，通知不能成为指标。
- 活跃任务跨阶段复用 SDK 模型目录与设置；检查配置文件身份、纳秒时间戳、大小和环境摘要后复用，变化后重载。首次加载期间配置变化最多重试一次；每阶段继续独立会话、重新验证 skill 并回收扩展，取消和恢复边界不变。
- 检查点只增量写有变化的节点；事件游标更新 SQLite JSON 字段，不再克隆、删除和重建目标树。继续同步持久化后再通知订阅者。
- 进程内事件传对象，多 SSE 订阅共用一次编码。规划要求简单写文件、组件发布使用既有原生 execute 动作，减少不必要的命令进程和重复工具步骤。

## 同机测量

表中为热路径 p50，单位 ms。通知、观察、资源、检查点、事件和文件写入各 30 次；模型目录 10 次；命令 15 次。首轮与 p95 保存在原始 JSON。

| 路径 | 改前 | 改后 | 判断 |
| --- | ---: | ---: | --- |
| Pi 桥通知到 Hook 交付 | 51.245208 | 0.003667 | 移除固定等待；仅同进程排队，不含事实回读与调度执行 |
| 模型目录准备 | 2.483375 | 0.064958 | 配置未变时复用，约减少 97.4% |
| 100 节点检查点更新 | 0.834250 | 0.573333 | 约减少 31.3% |
| 100 节点任务事件提交 | 0.830833 | 0.286334 | 约减少 65.5% |
| 完整项目观察 | 4.323709 | 4.535791 | 未优化这一路径，短测有负载波动 |
| 所选 skill 资源加载 | 0.780666 | 0.771667 | 基本不变，仍每阶段核验 |
| 原生 execute 文件写入 | 0.374000 | 0.398584 | 基本不变 |
| 真实 Node 命令启动及退出 | 24.536000 | 25.368834 | 未降低外部进程启动开销 |

模型目录首轮为 9.311041 → 13.138959 ms；缓存增加配置一致性检查，不能据热路径数据宣称冷启动更快。Pi 通知热路径 p95 为 51.568333 → 0.022583 ms；不表示操作系统或整个实验的延迟上限。第二次改后测量与首次改后结果接近：模型目录热路径 0.069458 ms，检查点 0.580750 ms，事件 0.279458 ms。

证据保存在本机独立目录，不入库：

- `/Users/lin/.codex/visualizations/2026/10/18/research-perf-before.json`
- `/Users/lin/.codex/visualizations/2026/10/18/research-perf-after.json`
- `/Users/lin/.codex/visualizations/2026/10/18/research-perf-final.json`

## 验证与边界

核心测试覆盖 Hook 合并与关闭、相同事实不写检查点、实际 SDK 的两阶段压缩、审批与取消、暂停重建、关系事务回滚、配置替换失效、事件持久化失败不通知及 SSE 编码共享。Server 源码与新增脚本、相关测试 TypeScript 检查通过。实际执行的核心测试共 38 项通过；文档相对链接与 `git diff --check` 通过。

在 `server/` 执行：

```sh
pnpm exec tsx --test test/research-hooks.test.ts test/research-relations.test.ts test/research-model-environment.test.ts test/research-resources.test.ts test/research-runtime.test.ts test/research-decision.test.ts test/task.test.ts
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck --types node scripts/research-live/performance.ts test/research-model-environment.test.ts test/research-hooks.test.ts test/research-relations.test.ts test/fixtures/research-sdk-loop.ts
```

科研 Runtime、Pi 桥和组件 execute 本来就在同一 Node 进程，直接传对象；本次减少的是调度等待、重复准备、复制和写入。外部命令使用受控子进程与内存管道；没有改变任意命令的进程隔离和权限语义。日志与检查点仍需落盘，不能将这里的微秒数宣称为跨进程共享内存或端到端零复制。未测量 Rust 桌面私有 TCP 通道、桌面 UI 呈现、大仓库 Git 扫描或大规模训练吞吐。

## 优化后的真实模型闭环

用本机已有 `glm-5.3-flash` 配置重新运行完整实验，模型 10 次请求均 HTTP 200；10 对 SDK 生命周期通知。选择 `gzip-study` 和 `experimental-design`，未选资源保持隔离，模型无直接工具。

基线 gzip level=1 为 3043 B，模型选择 level=9 后为 2826 B，减小 7.1311%，真实解压字节一致；两阶段各执行一次，整体验收通过。两个独立进程共用 SQLite，完成基线反思、暂停、进程重建、手动恢复、优化和最终反思。32 次同事实通知未增加模型调用，六个各三秒静默窗口未重复执行。该验收证明优化后行为闭环，不将与上一次不同源码的压缩率或模型墙钟时间作为速度比较。

证据目录：`/Users/lin/.codex/visualizations/2026/10/18/yunfeng-research-fast/`，包含 `audit.json`、`trace.jsonl`、`result.json`、两个检查点及压缩产物。
