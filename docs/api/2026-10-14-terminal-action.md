# terminal_action 本机终端

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `terminal_action` |
| 用途 | 工作台本机交互 Shell 的创建、输入、输出和回收 |
| 调用方 | 工作台终端及应用内 `terminalApi` SDK |
| 提供方 | Rust `terminal` 模块 |
| 稳定性 | 实验性 |
| 引入版本 | 0.1.0 |
| 维护方 | Yunfeng |
| 接口类型 | Tauri command |
| 调用方式 | 异步，阻塞 PTY 操作隔离到现有 Tauri 阻塞执行器 |
| 权限或认证 | `default` capability，`allow-terminal-action`，调用窗口必须为 `main` |
| Content-Type | 不适用，IPC 序列化 |

## 请求

SDK：`app/src/features/workbench/services/terminal.ts`。字段位于 `request`，未知字段拒绝。

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| action | IPC request | string | 是 | — | list/start/read/write/resize/stop/close | 操作 |
| size.cols | IPC request | integer | start/resize | — | 20–300 字符列 | PTY 宽度 |
| size.rows | IPC request | integer | start/resize | — | 4–200 行 | PTY 高度 |
| id | IPC request | string | read/write/resize/stop/close | — | 由 start 返回的 UUID | 进程内会话标识 |
| cursor | IPC request | integer | read | — | 0 至当前输出字节数 | 下次读取起始字节；首次使用 0 |
| data | IPC request | string | write | — | UTF-8 1–16384 字节 | 原始终端输入，回车使用 `\r` |

`list` 只允许 action；start 只允许 action/size；read 只允许 action/id/cursor；write 只允许 action/id/data；resize 只允许 action/id/size；stop/close 只允许 action/id。

## 响应

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| list 返回值 | string[] | list | 最多 4 个，按 ID 排序 | 当前保留的会话，包含停止但未关闭的会话 |
| id | string | start | UUID | 新会话 |
| data | integer[] | read | 0–255，每次最多 65536 字节 | 原始 PTY 字节，交给 xterm 解码，包含 ANSI 控制序列 |
| cursor | integer | read | 单调递增 | 下一次 read 的游标 |
| truncated | boolean | read | — | 请求游标早于缓存，已有内容被截断 |
| closed | boolean | read | — | 输出已结束且已读完缓存 |
| failed | boolean | read | — | 读取 PTY 失败 |
| write/resize/stop/close 返回值 | null | 对应操作 | — | 操作完成 |

## 错误码

错误格式 `{ code: string, message: string }`，message 为脱敏中文。

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| FORBIDDEN | 非主窗口 | 否 | 使用主窗口 |
| INVALID_SIZE | 尺寸越界 | 修改后 | 重新计算尺寸 |
| INVALID_CURSOR | 游标超过输出末尾 | 修改后 | 新会话从 0 开始 |
| INVALID_INPUT | 空输入或超过 16 KiB | 修改后 | 分批输入 |
| LIMIT | 已保留四个终端 | 关闭后 | 关闭不用的会话 |
| BUSY | 已有输入正在写入 | 是 | 前端串行等待，不自动重放命令 |
| NOT_FOUND | 会话已关闭或后端重启 | 否 | 刷新清单后手动创建 |
| STATE_ERROR | 状态锁或阻塞任务失败 | 是 | 手动重试一次，持续失败则重启应用 |
| START_FAILED | PTY、Shell 或读取线程创建失败 | 是 | 检查默认 Shell 后手动重试 |
| WRITE_FAILED | 写入失败 | 否 | 停止或关闭后重新创建 |
| RESIZE_FAILED | 调整 PTY 失败 | 是 | 手动重试 |
| STOP_FAILED | 进程或读取任务未完成回收 | 是 | 保留会话占位，稍后手动重试关闭 |

## 权限与安全

终端是本机完整 Shell 能力，使用当前登录用户权限。命令可能修改或删除本机文件，前端须明确显示本机执行语义，由用户手动启动。禁止从 Agent 消息、远程消息或恢复标签自动执行输入。浏览器和组件子窗口不获得权限。

Shell 使用系统默认程序，工作目录为用户目录（不可用时沿用平台默认）。SDK 不接受自定义程序、命令行参数或工作目录。输入输出仅保存在进程内，不写日志或数据库；可能包含敏感内容，调用方不得上传或记录。

## 行为约束

- 每次 start 创建一个新会话，没有隐式幂等键。close 对不存在会话幂等；stop 保留回放，close 回收并移除。重新启动由 close 后 start 实现。
- 上限四个保留会话，每个一个阻塞读取线程和 256 KiB 字节缓存。read 最多返回 64 KiB，读取可重试，不消费缓存。超过容量丢弃最旧输出并通过 truncated 通知。
- 前端每次输出绘制确认后再读下一段；空闲间隔 100 ms。输入串行，待发送上限 64 KiB，超过 16 KiB 单次粘贴明确拒绝。
- stop 终止 Shell；Unix 同时终止当前前台任务进程组，并等待读取线程，读取等待上限两秒。用户主动脱离终端的 daemon 不在回收保证内。Windows 子进程树行为尚未原生验收。
- 切换或收起页面保留 PTY；关闭终端标签回收。关闭中央工作区标签仅卸载视图，工作台仍可连接原会话。正常退出应用停止全部会话。后端重启后清单为空，调用方刷新清单，不重放命令。
- 无远程终端、文件传输、持久化或 HTTP 接口；本批为本机交互终端迁移。

## 调用示例

在 Tauri 主窗口的模块中运行：

```ts
import { terminalApi } from "./features/workbench/services/terminal";
const { id } = await terminalApi.start({ cols: 80, rows: 24 });
await terminalApi.write(id, "printf 'hello\\n'\r");
const output = await terminalApi.read(id, 0);
// 下次读取传 output.cursor；data 原样交给 xterm.write(Uint8Array)。
await terminalApi.close(id);
```

start 成功返回 `{ "id": "00000000-0000-4000-8000-000000000001" }`，错误示例 `{ "code": "LIMIT", "message": "最多同时保留四个终端" }`。

## 兼容性与变更记录

允许响应增加字段，调用方应忽略未知响应字段；请求结构严格校验。无废弃计划。

| 日期 | 版本 | 变更类型 | 内容 | 迁移说明 |
| --- | --- | --- | --- | --- |
| 2026-10-14 | 0.1.0 | 新增 | 本机终端 SDK 与主窗口 IPC | 使用 terminalApi |

迁移参考本地 LianAgent 的交互终端与标签组件；终端渲染按 [xterm.js 插件接口](https://xtermjs.org/docs/guides/using-addons/)，PTY 按 [portable-pty 0.9](https://docs.rs/portable-pty/0.9.0/portable_pty/) 接入。xterm.js 使用 MIT，portable-pty 使用 MIT；本次只新增终端所需依赖。
