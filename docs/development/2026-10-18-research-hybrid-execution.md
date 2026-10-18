# 科研 TS 编排与 Rust 执行

日期：2026-10-18。TS 保留 Hook、决策、Pi SDK、授权、作业和状态编排；Rust 接管项目内有界文本读写与指标验收。生产适配复用现有桌面私有 AgentBridge，不增加进程、端口或线程池。接口、错误及兼容性见 [执行契约](../api/2026-10-18-research-execution.md)。外部命令和 SQLite 仍沿用已有实现，后续执行能力按测量结果逐步迁移。

## 闭环验收

真实 Rust 通道启动 TS ResearchService，以固定规则替代模型：等待控制事实、Hook 唤醒、选择基线任务、execute 写产物、实测验收、反思、暂停、销毁并重建 TS 服务、恢复后执行筛选任务、最终验收。两阶段各执行一次，共3次反思；暂停时通知不激活执行。文件通过 Rust 严格 UTF-8 行为确认实际路由，无静默回退。

这验证 TS 服务恢复，不等于桌面进程重启或真实模型验收。另以核心回归验证客户端容量、取消、连接失败不重放、鉴权、敏感路径和原子文件执行。

## 三轮实测

沿用 [固定复杂工作流](2026-10-18-research-fixed-workflow.md)，增加真实混合路径，每组36环节，完整循环3次，不调用 LLM。合计432条记录，逐环节结果、暂停快照、事件顺序和跨语言 SQLite 回读全部一致。单位 ms，数字为本轮三次累计值的中位数：

| 路径 | 包含生命周期 | 扣除启动、重建与关闭 |
| --- | ---: | ---: |
| Node 进程内 | 16.199 | 12.168 |
| Node 管道 | 85.953 | 20.017 |
| Rust release 管道 | 18.483 | 9.215 |
| TS 管道编排 + Rust 调试宿主 TCP 执行 | 96.290 | 30.670 |

当前混合路径未获得加速。小文件多次 JSON/TCP 往返增加开销；读取样本环节由 Node 管道的0.237 ms变为混合路径的2.119 ms。混合宿主为 debug，而独立 Rust worker 为 release/LTO；报告保存 profile 和可执行文件指纹，这些数据不能用于同构建条件下的语言排名。三次测量也不足以估计稳定的尾延迟。

该结果支持保留 TS 的编排职责、按执行单元规划 Rust 边界；进一步优化应减少往返、将相邻计算与文件操作放在同一执行请求中，再用 release 桌面宿主复测。当前 TCP/JSON 不是共享内存或零拷贝，不能宣称接近内存传输速度。

复现入口见 [脚本说明](../../server/scripts/research-live/README.md)。本机证据不入库：

- `/Users/lin/.codex/visualizations/2026/10/18/research-hybrid-workflow/workflow-comparison.json`
- `/Users/lin/.codex/visualizations/2026/10/18/research-hybrid-workflow/workflow-comparison.md`
