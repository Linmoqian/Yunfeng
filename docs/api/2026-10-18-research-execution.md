# 科研 Rust 文件执行

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | 桌面私有通道 `research` |
| 用途 | 将科研有界文本读写与实测验收交给 Rust |
| 调用方 | TypeScript 科研 project / execute 适配层 |
| 提供方 | 现有 AgentBridge 与 `yunfeng-research-kernel::execution` |
| 稳定性 | 实验性 |
| 引入版本 | 0.1.0 |
| 维护方 | Yunfeng 科研 Runtime |
| 接口类型 | 既有 loopback TCP 单次换行 JSON 私有请求，无新端口 |
| 权限或认证 | 桌面父进程注入端口、随机令牌和能力标识，WebView 无此权限 |

TS 管理 Hook、上下文、Decision Engine、Pi SDK、计划授权、作业身份、超时/取消、完成事件、状态与记忆；Rust 校验路径、读取/原子替换文件、核验真实指标。节点数据库仍沿用现有 TS 存储，Rust GraphStore 不接管生产数据库。外部命令由现有 JobExecutor 授权并管理生命周期；桌面能力3通过同一私有通道调用内置 Rust PTY，直接传递 program/args。参见 [核心工具与仲裁](2026-10-18-research-tools.md)。

## 请求

复用 [桌面私有通道](2026-10-14-terminal-action.md) 的 `{token,request}`，外层 request 为 `{action:"research",request:{...}}`。鉴权通过后执行内部请求；内部请求与条件对象拒绝未知字段。

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| action | 内部 request | string | 是 | — | read/write/evaluate/read_many/write_many/read_range/patch | 操作 |
| cwd | 内部 request | string | 是 | — | 非空，最多4096 UTF-8字节，无 NUL | 项目根，Rust canonicalize |
| path | read/write | string | 是 | — | 非空，最多2000 UTF-8字节 | 项目内相对路径，拒绝越界、敏感资源和链接 |
| content | write | string | 是 | — | 最多65536 UTF-8字节 | 原子写入内容 |
| paths | read_many | string[] | 是 | — | 1到8项，每项同 path | 按输入顺序观察文件 |
| files | write_many | object[] | 是 | — | 1到8项 | 连续写入步骤，按原顺序执行 |
| files[].path | write_many | string | 是 | — | 同 path | 目标文件 |
| files[].content | write_many | string | 是 | — | 每项最多65536 UTF-8字节，总计最多512 KiB | 文件内容 |
| condition | evaluate | object | 是 | — | 原科研 Condition | 文件或数值验收条件 |
| condition.kind | condition | string | 是 | — | file_exists/metric | 条件类型 |
| condition.path | condition | string | 是 | — | 同 path | 实际产物 |
| condition.key | metric | string | 是 | — | 非空，最多2000 UTF-8字节 | 点分字段路径 |
| condition.operator | metric | string | 是 | — | >、>=、<、<=、== | 数值比较 |
| condition.value | metric | number | 是 | — | 有限数值 | 目标值 |

write_many 的 condition 为可选，默认省略；存在时只在全部写入完成后验收。其条件结构与 evaluate 相同。read_many 不接受写入或条件；files 项拒绝未知字段。

Rust 验证项目内路径和文件边界，TS 在调用 write 前验证计划授权并持久化作业身份。本通道只接收受信任 Server 的调用，不直接提供模型工具；不应将令牌交给模型、页面或外部程序。

## 响应

复用 `{result}` 或 `{error:{code,message}}`。

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| read result | string | read 成功 | 普通文件、合法UTF-8、最多64 KiB | 文件真实文本 |
| write result | null | write 成功 | 同目录临时文件后 rename | 替换完成，无额外 fsync 承诺 |
| evaluate result.passed | boolean | evaluate 成功 | — | 实测条件是否通过 |
| evaluate result.actual | unknown | 否 | 数值或文件布尔值 | 真实观测值，未知时省略 |
| evaluate result.reason | string | evaluate 成功 | 不含凭据 | 条件说明；无法读取或指标无效时返回 passed=false |
| read_many result | object[] | 成功 | 与 paths 等长、同序 | 每项为 {content:string} 或 {error:string}，错误不回显路径 |
| write_many result.evaluation | object/null | 成功 | 有 condition 时同 evaluate，否则 null | 全部写入之后的真实验收结果 |

原生读取严格拒绝无效 UTF-8；独立 Node 路径仍沿用替换无效字节的历史行为。文件变化与读取结果仍由 TS Hook / Context 层判断是否值得行动。

## 错误码

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| FORBIDDEN | 鉴权或请求结构无效 | 否 | 检查桌面注入与字段 |
| RESEARCH_IO_FAILED | 路径越界、敏感文件、非法UTF-8、大小或文件执行错误 | 不自动重试 | 核对具体计划与实际文件 |
| 客户端连接错误 | 中断、关闭、超时或响应越界 | 不自动重试 | 写入结果可能未知，先观察文件与作业状态 |
| 客户端容量错误 | 已有8项在途文件请求 | 释放容量后由编排决定 | 文件客户端仍最多8项；统一仲裁最多32项等待 |

错误不回显 OS 路径或令牌。evaluate 的真实文件缺失/非法指标返回 passed=false；通道失败在 TS evaluate 返回带连接失败原因的未通过结果，write/read 则拒绝 Promise。

## 权限与安全

复用桌面现有随机令牌、端口和单线程顺序通道。新桌面启动子进程时注入 `YUNFENG_RESEARCH_NATIVE=3` 表示支持批量、行读取、精确修改和科研 PTY；能力 `2` 保留批量操作；旧宿主的 `1` 继续使用逐项请求，不试探或重试批量操作。端口/令牌仍由 `YUNFENG_APP_PORT`、`YUNFENG_APP_TOKEN` 提供，均不返回前端、不记录日志、不保存到项目环境文件。没有标识时沿用独立 Server 的 Node 路径；未知标识或连接无效时失败，不切回 Node。

该接口不新增 Tauri command 或 capability，不改变用户授权范围。路径检查不是操作系统沙箱，不防御其他本机进程恶意竞态替换目录。读取前拒绝静态 FIFO/设备/目录并在打开后复核，防止普通特殊文件阻塞共用通道。

## 行为约束

- 单请求单连接，客户端总超时5秒，v1响应上限512 KiB、v2/v3为4 MiB（覆盖八个64 KiB文本经 JSON 转义的最坏膨胀）；通道读写超时各2秒，请求沿用8 MiB上限。Rust 执行复用现有通道线程，无新线程池或额外工作进程。响应通过固定8 KiB缓冲合并细碎写入，不另复制整帧。
- 客户端最多8项在途，超限拒绝；Rust 顺序处理，不增加无限队列。不自动重连后重放写入，不把“没收到结果”视为“没有执行”。
- 取消在请求发出前与返回后检查；已发出的短原子操作可能已提交，取消不是回滚。JobExecutor 等待请求结果，记录取消或失败；超时/断线后不切换执行后端。
- read/evaluate 无副作用；write 会创建父目录并替换文件。相同内容重复提交仍是一次新执行，无隐式幂等键；重启恢复沿用科研作业检查点，未知作业不自动重跑。
- `execute` 仍是实验副作用唯一入口。private SDK 不处理目标树、预算、模型、UI、持久化检查点或自动唤醒。
- 观察范围与同次 Hook 的文件回读最多八项合并提交；不缓存跨轮事实、不延迟攒批。单项读取错误保留其位置，其他文件继续返回真实内容；通道失败则整个批次失败。
- execute 只合并相邻的 write_file；run_command、focus_component、update_component 截断批次。仅最后一步属于写入批次时，才将 success_condition 带入同次请求；验收不会提前到命令或组件更新之前。
- Rust 写入前校验整个批次的路径、文本大小和条件结构；非法输入时不开始写入。文件系统错误或竞态仍可导致部分文件已提交，其余步骤停止；每个文件原子替换，整个批次不是事务。取消只在批次提交前后检查，不承诺每个文件之间可取消或撤销。

## 调用示例

Server 内部复用简单适配器，Agent 仍提交原有 Plan：

```ts
const files = nativeResearchFiles();
if (files) {
  await files.write(projectRoot, ".lin/experiments/config.json", "{}");
  const result = await files.evaluate(projectRoot, {
    kind: "file_exists", path: ".lin/experiments/config.json",
  });
}
```

写入示例仅适用于授权完成后的 execute 内部。生产调用点为 `writeExecutionFile`；读取与验收复用 `readProjectText`、`evaluate`，Plan 增加 read_file、patch_file、read_horizon；旧步骤与 HTTP 路径保持兼容。

v2 内部适配器提供 `readMany(cwd, paths)` 与 `writeMany(cwd, files, condition?)`，execute 由 `writeExecutionFiles` 交付已授权的连续步骤。只读 `submittedRequests` 是客户端提交计数，用于诊断和对照，包含失败尝试；不包含请求内容，也不代表实验成功。

## 兼容性与变更记录

| 日期 | 版本 | 变更类型 | 内容 | 迁移说明 |
| --- | --- | --- | --- | --- |
| 2026-10-18 | 0.1.0 | 扩展 | TS 编排/Rust 文件执行，复用私有通道 | 新桌面父进程自动注入能力；旧桌面与独立 Server 沿用 Node |
| 2026-10-18 | 0.2.0 | 兼容扩展 | 有界批量观察、连续写入与末尾验收；固定响应缓冲 | 以能力2启用批量；能力1使用原单项接口，旧请求仍可调用 |

`hybrid-check.mjs` 在真实 Rust AgentBridge 下验证现有 TS ResearchService 的 Hook、决策、文件写入、验收、反思、暂停与服务实例恢复；使用规则替代模型。固定三轮基准的 `--hybrid` 测真实 TCP 文件路径，保留原三组基线并对照同宿主的单项/批量请求；宿主与 worker 的 profile 在报告中区分，不据此推断真实模型速度。

早期调试宿主数据见 [混合执行记录](../development/2026-10-18-research-hybrid-execution.md)，最新 release 对照见 [批量执行记录](../development/2026-10-18-research-boundary-batching.md)。

能力3的 `read_range` 接受 cwd/path/start_line/line_count，返回 content/start_line/total_lines/truncated；行号从1开始、最多1000行，文件仍上限64 KiB。`patch` 接受 cwd/path/old_text/new_text，返回 changed/bytes；非空原文须唯一匹配，包括重叠匹配的歧义也会拒绝。执行前重读检测外部变化；检查与 rename 之间仍可能发生外部竞态，不保证跨进程 CAS。详细权限、取消和失败语义见 [核心工具契约](2026-10-18-research-tools.md)。
