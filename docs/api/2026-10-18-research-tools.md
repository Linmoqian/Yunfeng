# 科研核心工具与调用仲裁

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 标识、稳定性 | 科研 Plan / execute，实验性，0.1.0 |
| 调用方、维护方 | Pi 结构化规划；Yunfeng 科研 Runtime |
| 协议 | 沿用既有 Plan、Task API 和桌面私有换行 JSON 通道，不新增公开端口 |
| 权限 | TS 任务归属及具体计划授权；桌面父进程注入随机令牌；Rust 再验证参数和路径 |
| 事实来源 | 项目文件、TaskStore、已有共享组件；视界不另存业务状态 |

科研仍使用 Pi SDK 的无工具模型会话。模型提交 `steps`，Runtime 通过 `execute` 调用下列操作；这四类能力没有新增四个可绕过审批的模型直连工具。任务 API 见 [原契约](2026-10-15-research-runtime.md)。

## 请求与返回

步骤参数直接位于对象中，每个计划最多8步，顺序执行。未知步骤字段拒绝。桌面新操作要求能力 `YUNFENG_RESEARCH_NATIVE=3`；旧宿主原步骤继续兼容，新行读取和补丁明确要求升级。独立 Server 沿用有界 Node 文件实现及无 shell 子进程。

| 类别 | 步骤与参数 | 返回与边界 |
| --- | --- | --- |
| 读取 | `read_file {path,start_line?,line_count?}` | UTF-8 文本片段及 `start_line,total_lines,truncated`；默认1/200，行号1到65537、数量1到1000，整个文件最多64 KiB |
| 修改 | `patch_file {path,old_text,new_text}` | `changed,bytes`；非空原文必须唯一匹配，每段最多64 KiB，结果最多64 KiB，保留未修改字节 |
| 修改 | 原有 `write_file {path,content}` | 全文原子替换；只合并相邻写入，不跨其他步骤；沿用部分提交边界 |
| 终端 | 原有 `run_command {program,args}` | 输出、真实退出状态；由作业完成事件驱动反思，非零码为失败 |
| 视界 | `read_horizon {domain}` | `domain,available,summary,revision?,data?`；只读有界投影，未注册模块返回 available=false |
| 视界已有操作 | 原有 `update_component`、`focus_component` | 按现有报告字段与交互反馈契约发布、聚焦；工程师操作时让出控制 |

`path` 是项目内相对路径，TS 最多500字符，Rust 最多2000 UTF-8字节。敏感资源、越界、符号链接和非普通文件均拒绝。`patch_file` 和 `write_file` 使用同一写权限根或具体整份计划批准；读取不授予修改或命令权限。根目录本身不可作为文件修改对象。

补丁检测零匹配、多匹配和重叠匹配歧义，重新读取发现文件变化时失败；提交用既有同目录临时文件与 rename。检查与提交之间仍可能存在外部进程竞态，不保证跨进程 CAS，也不承诺 fsync。取消不是回滚。

示例（须处于获准计划中）：

```json
{
  "decision": "act",
  "reason": "调整实验配置后核验真实报告",
  "steps": [
    {"action":"read_file","path":"README.md","line_count":20},
    {"action":"patch_file","path":".lin/experiments/config.json","old_text":"\"level\":1","new_text":"\"level\":9"},
    {"action":"run_command","program":"node","args":["experiment.mjs"]},
    {"action":"read_horizon","domain":"training"}
  ],
  "success_condition":{"kind":"metric","path":".lin/experiments/report.json","key":"completed","operator":"==","value":1}
}
```

各步结果进入有界作业 output（最近65536字符），详细过程继续按工具角色保存，不自动追加为对话结论。只读视界不是实验完成或设备就绪的证明。

## 视界适配

内部入口 `service.horizon(taskId).read(domain, signal?)`，仅受信服务调用，无新增 HTTP 路由。任务不存在或非科研任务拒绝。适配器 `createHorizon(taskId, ports)` 接收明确的读取端口，不接受任意脚本。

| domain | 当前复用模块 | 说明 |
| --- | --- | --- |
| training | 当前任务检查点和科研报告组件 | 阶段、作业、报告进度、指标、结论和验收；不直接探测 GPU 或训练服务 |
| literature | 桌面 resources 组件 | 最多20项资源元数据，不将普通附件推断为已核验文献 |
| writing | 桌面 writing 组件 | 文稿名称、版本和最多2000字符正文摘录 |
| ideas | 当前任务目标树 | 当前选点、节点数量、最多8项节点目标及关系 |

每个投影 JSON 最多16000字符。独立 Server 未连接资源/文稿时返回不可用；适配失败或投影超限明确报错。变更仍通过已有获准 execute 操作处理；新增领域写入适配需要单独定义契约。目标树的 `horizon` 字段仍表示滚动候选节点。

## Rust 终端私有请求

沿用 `{token,request}` / `{result}` 或 `{error:{code,message}}`。与 [已有终端](2026-10-14-terminal-action.md) 共享 Runtime、最多4会话、每会话256 KiB缓存、每次最多64 KiB字节读取。

| action | 字段、校验 | 结果、副作用 |
| --- | --- | --- |
| run | cwd；program 1到500字节；args最多32项、每项最多8000字节；jobId 1到200字节；文本无NUL | `{id}`，直接启动程序，不隐式调用 shell；TS 更严格限制每参数最多2000字符 |
| read | id/cursor | 原终端输出与退出状态，桌面和 Agent 使用独立游标 |
| stop/release | id | 停止回收，保留可见输出，退出后标记可回收会话 |
| stopJob | jobId | 回收该科研作业及其 `jobId:步骤序号` 绑定的进程，返回 null；未知身份无操作，可重复调用 |

生产 run 的身份由宿主生成，模型不能提供；相同已保留身份与相同目录、程序、参数返回原会话，参数不同返回 CONFLICT。该去重只覆盖 Rust 宿主内仍保留的映射；会话关闭、回收或桌面重启后不承诺持久幂等。TaskStore 的检查点负责未知作业暂停，禁止自动重放。

任务命令要求完整 program/args 预授权或当前计划批准；计划入队及实际提交均核对当前任务、作业身份、暂停状态与权限。Agent PTY 只读，主窗口 Write 也拒绝，防止向获准程序注入额外指令。路径授权不是 OS 沙箱，获准程序仍具有本机用户权限。

停止/超时/暂停会取消等待调用并停止进程组，最多等待既有读取线程2秒。TS 必须核实退出码及输出结束后才提交完成结果；命令30分钟上限、结果最近65536字符。输出游标持续读取，空闲100ms，暂停不依赖模型轮询。Unix 后代若主动脱离进程组不在回收保证内。当前原生验收为 macOS，Linux 未实机验证、Windows 不启用科研 PTY。

连接或启动响应丢失不重放 run、不回退 Node；尽力按 jobId 停止。回收无法确认时报告 `TERMINAL_CLEANUP_FAILED`，结果为 interrupted。Server 恢复未知作业时先持久化 PAUSED/interrupted，并按身份回收仍由桌面持有的进程；恢复前再次核对回收，随后反思中断结果，下一计划重新授权。

## 仲裁与错误

TS 的 `toolArbiter.run(call, operation)` 在入队和实际提交时重检权限、取消；最多8个活跃调用、32个等待调用。策略v1固定成本 read=1、modify=3、terminal=8、horizon=2，得分减去输入体积成本（最多8），加等待时间（最多10）。同分维持入队顺序；仅选择资源已就绪操作，不重排同一计划。数值是相对估计，不是测得的性能或目标价值模型。

同项目修改与终端互斥；同一文件读可共存，写与读/写冲突等待。命令执行期间仍允许观察读取，不提供项目事务快照。原子批次内不逐文件取消；已发出的短操作可能已提交。真实执行发生后才知道的错误记录为失败或结果未知，不伪称仲裁拒绝。

内部 `toolArbiter.status` 返回 policy/active/waiting，`receipts()` 返回最近64条 tool/score/waitMs/elapsedMs/outcome；不含命令、路径、凭据。不持久化第二份任务状态。完整价值评分、设备仲裁和实测成本校准后续实现。

| 错误 | 处理 |
| --- | --- |
| TOOL_FORBIDDEN / 计划未授权 | 不执行；审批或重新提交具体计划 |
| TOOL_LIMIT / 文件容量已满 | 有界背压，无隐式重试 |
| TOOL_CANCELLED / AbortError | 等待取消无副作用；在途取消须核对结果 |
| RESEARCH_IO_FAILED / 原文匹配冲突 | 重新观察真实文件，不盲目重试补丁 |
| FORBIDDEN / CONFLICT / LIMIT | Rust 私有鉴权、作业绑定或终端容量校验失败 |
| TERMINAL_CLEANUP_FAILED | 结果未知，保留暂停并核对内置终端 |

## 验证与兼容性

在 `server/` 构建后，从仓库根显式执行：

```sh
cargo test --locked --manifest-path app/src-tauri/Cargo.toml research_core_tools_authorization -- --ignored --nocapture
```

2026-10-18 macOS 实测：真实 Rust bridge、文件补丁和 PTY；首次无授权时配置和进程均未改变，批准后启动；运行中暂停回收真实 PID，旧授权失效；恢复先反思取消结果，新计划获批后完成真实报告和组件发布；共2次实验执行、3个不同作业的反思（含最终验收），无重放。另模拟 Server 丢失在途作业，按身份回收 Rust 持有的进程并保存 interrupted。模型调用为0，不代表真实模型质量或 UI 动画验收。

新增请求是兼容扩展，既有步骤与路径继续有效；接口新增时同步更新类型、解析、执行与本文件。旧宿主能力1/2保留原路径，已配置的桌面通道失败不降级。既有数据库格式未迁移，新步骤随现有 Plan 检查点保存；请使用支持这些步骤的版本恢复。

构建、Rust fmt/Clippy、科研测试、既有终端工具回归及65份文档链接检查通过；Rust 核心5项通过，桌面全量串行34项通过、5项显式跳过，其中2项原生文稿导出依赖未验收，3项跨栈入口本次均另行显式运行通过。固定三轮工作流用于兼容性回归，本次宿主是 debug，不作为 release 性能结论。首次默认并行全量有1项既有团队节点连接测试失败，单独及串行重跑通过；其启动时序风险未在本次修改。
