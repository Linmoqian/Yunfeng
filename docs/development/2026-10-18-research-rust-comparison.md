# 科研 Rust 核心与 Node 基线对照

日期：2026-10-18。基线为 a77ff1a 当前实现，沿用上一轮文件写入、100 节点检查点和事件提交夹具，并补充读取、数值验收、IPC、启动与 RSS。机器为 Apple M4 / macOS arm64，Node v26.7.0，rustc 1.95.0；Rust 为 release + LTO + opt-level=3。

## 范围与方法

新增独立 [research-kernel](../../app/desktop/src-tauri/research-kernel/README.md) library，实现项目内路径检查、64 KiB 文本读写、原子替换、数值验收、SQLite v1 节点保存、关系恢复与事件游标。生产 Runtime、Pi SDK 和数据库归属不变；只运行显式建立的独立夹具。

Node 对照直接复用已编译的生产 project、JobExecutor、TaskStore、TaskEventHub 和 ResearchGraphStore。Rust 使用单线程阻塞核心；Node 使用既有异步文件调用。写入结果均经真实文件存在验收；检查点和节点数量一致，事件均先追加日志再提交游标；日志中的随机身份与时间戳不同。SQLite 的版本和绑定、JSON 对象实现、任务管理包装、时间戳与 UUID 实现不同，因此比较的是当前实现与候选核心的实际开销，不能将全部差异归因为语言。

每轮每项先预热 5 次，再记录 100 次；Node/Rust 工作进程交替先后顺序，每次只允许一个在途请求。最终数据为三轮各自 p50 的中位数，原始 JSON 同时保留各轮 p95。两种持久化实现均逐次打开并关闭 SQLite，使用默认同步提交；没有关闭日志、fsync 或持久化来获得性能优势。文件写入均为同目录临时文件后 rename，不增加断电恢复承诺。

计时层次：Node direct 在基准进程内调用同一 Node 实现；Node/Rust pipe 包含父进程序列化、管道发送、工作进程解析、操作、响应编码、回传、父进程解析和 Promise 完成。Rust inner 只包含操作与返回值构造，不包含请求解析和响应编码。没有共享内存或零复制假设。

## 同机结果

下表单位 ms，数值为三轮 p50 的中位数。

| 操作 | Node 进程内 | Node 管道往返 | Rust 核心内部 | Rust 完整往返 |
| --- | ---: | ---: | ---: | ---: |
| 128 B echo | 0.000375 | 0.023958 | 0.000083 | 0.014916 |
| 64 KiB echo | 0.000375 | 0.210916 | 0.001458 | 0.157042 |
| 8190 B 文本读取 | 0.100292 | 0.155709 | 0.032208 | 0.065542 |
| 真实数值指标验收 | 0.169292 | 0.201042 | 0.034375 | 0.053208 |
| 原子写入与文件验收 | 0.430042 | 0.455958 | 0.186625 | 0.212042 |
| 100 节点检查点更新 | 0.635334 | 0.710917 | 0.609625 | 0.644167 |
| 100 节点任务事件提交 | 0.336416 | 0.359542 | 0.335375 | 0.350792 |

Rust 管道验收约 0.053 ms、写入约 0.212 ms，优于当前 Node 进程内约 0.169 / 0.430 ms；值得优先考虑文件操作与结果核验下沉。检查点约 0.644 ms 对 Node 0.635 ms，事件约 0.351 ms 对 Node 0.336 ms，计入边界后没有明显收益，暂不支持整体迁移状态存储。纯对象传递仍明显快于管道，因此已有同进程 Hook/组件交互继续使用原路径。

| 开销 | Node | Rust |
| --- | ---: | ---: |
| 空命令启动并退出 p50 | 23.378 ms | 1.722 ms |
| 100 节点工作进程启动、保存并恢复后 ready p50 | 33.867 ms | 4.305 ms |
| 热路径后独立工作进程 RSS 三轮中位数 | 79.38 MiB | 5.14 MiB |

Rust 二进制 2264992 B（约 2.16 MiB）。空命令每轮 15 次、ready 每轮 5 次；ready 包含模板读取、100 节点落库与恢复。RSS 使用 ps 采样，不是峰值、CPU 消耗或业务活对象大小，未强制 GC。Pi 仍需 Node，新增 Rust 工作进程会叠加内存，不能将独立进程的 RSS 差额当成全应用节省。此启动指标也不包含 Tauri/WebView、模型目录、LLM 网络或训练环境。

Node SQLite 为 3.53.4，Rust bundled SQLite 为 3.53.2；使用项目已有 rusqlite 依赖。版本差异是持久化对照的限制。三轮原始报告记录源码与二进制 SHA-256，并拒绝测量期间更换 Rust 二进制。

Rust 事件写入从格式化直接写文件改为先编码到单个缓冲区再写入；检查点也改用借用字段序列化，避免复制另表保存的节点。这两处修正后的结果才纳入最终三轮汇总。

## 验证与复现

- Rust 两项核心测试通过：真实文件边界、链接、64 KiB 限制、数值类型、关系循环、事务回滚、增量节点、游标恢复与溢出拒绝。
- 三轮对照通过：各操作返回值核对、完整快照一致、Node 读取 Rust 数据库、Rust 读取 Node 数据库、非法路径与非数值指标拒绝，写入内容实际回读。
- cargo fmt --check、cargo test、cargo clippy --all-targets --all-features -- -D warnings 通过，范围为新独立 crate；Server build、对照脚本 TypeScript 检查与 node --check 通过。
- 原生 Tauri、Windows/Linux、跨机器、大文件传输、完整科研调度/审批/取消没有在 Rust 版本重写或验收。基准不用真实模型，LLM 速度不在本次比较中。

复现命令见 [crate 说明](../../app/desktop/src-tauri/research-kernel/README.md)，脚本为 [native-compare.ts](../../server/scripts/research-live/native-compare.ts)。临时工作进程使用现有 JSON 行与管道形式，未新增生产 API、网络端口或模型工具。

本机原始证据（不入库）：

- `/Users/lin/.codex/visualizations/2026/10/18/research-rust-compare-5/comparison.json`
- `/Users/lin/.codex/visualizations/2026/10/18/research-rust-compare-6/comparison.json`
- `/Users/lin/.codex/visualizations/2026/10/18/research-rust-compare-7/comparison.json`
- `/Users/lin/.codex/visualizations/2026/10/18/research-rust-compare-summary.json`

各目录保留双方 SQLite、事件日志和文本产物。早期第 1～4 轮用于发现额外复制和小写入开销，未混入最终汇总。
