# 科研本地 Rust 核心对照

独立、无 Tauri 依赖的 library，复用项目已有 serde、serde_json、rusqlite、uuid 和 tempfile。Rust 实现项目内文件检查、有界文本读取、原子写入、数值指标验收、SQLite v1 节点增量保存、事件游标提交和关系恢复。检查点借用字段序列化，避免完整复制另表保存的目标树。

文件读取、原子写入与实测验收已通过桌面现有私有通道接入 TS 科研 Runtime；GraphStore 仍用于隔离对照，未接管生产数据库。上层继续负责授权、取消、作业身份、Hook、Pi SDK 与用户交互；这里的文件写入方法要求调用方先完成具体计划授权。它不是可供不受信任代码直接调用的沙箱。UTF-8 解码错误在 Rust 返回错误，Node 既有文本读取会替换无效字节；对照输入使用合法 UTF-8。写入限制 64 KiB，原子替换不增加 fsync 承诺。接口与取消/故障边界见 [科研执行契约](../../../docs/api/2026-10-18-research-execution.md)。

在仓库根执行：

```sh
cargo build --release --locked --manifest-path app/src-tauri/research-kernel/Cargo.toml
cargo fmt --check --manifest-path app/src-tauri/research-kernel/Cargo.toml
cargo clippy --locked --manifest-path app/src-tauri/research-kernel/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path app/src-tauri/research-kernel/Cargo.toml
pnpm --dir server build
pnpm --dir server exec tsx scripts/research-live/native-compare.ts /absolute/path/to/new-comparison
```

`main.rs` 是隔离基准的私有工作进程，仅经 stdin/stdout 接收现有 JSON 行形式的请求，单次至多 1 MiB、顺序执行，无网络监听、任意命令入口或自动重放。目录由显式命令行参数指定，使用新建测试目录。`--inspect` 交叉读取 Node 生成的同构检查点；`--noop` 测量空进程启动；`--info` 返回 SQLite 版本。该入口没有注册为桌面 IPC 或 Agent 工具。

比较脚本调用当前生产 Node 实现，并分别记录进程内 Node、Node 管道、Rust 内部和 Rust 完整管道的 p50/p95，测量冷启动与采样 RSS。窗口、审批、取消、未知作业恢复与长时间训练仍由现有 Runtime 提供，未在 Rust 核心中重写。现阶段不宣称两套完整 Runtime 等价。

结果和边界见 [对照记录](../../../docs/development/2026-10-18-research-rust-comparison.md)。

按固定复杂流程完整执行三轮，使用 `pnpm --dir server exec tsx scripts/research-live/workflow-compare.ts /absolute/path/to/new-workflow-comparison`，逐环节记录真实系统时间与单调时钟耗时。私有 worker 的 `--resume` 读取既有数据库，跳过初始种子写入；`experiment` 仅为固定样本统计夹具，读取配置与样本、落盘指标并核验产物，不注册生产工具。流程及范围见 [固定工作流记录](../../../docs/development/2026-10-18-research-fixed-workflow.md)。
