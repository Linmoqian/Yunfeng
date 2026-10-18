# 工作台终端

`model.rs` 负责 IPC 类型、边界和输出缓存；`session.rs` 封装 portable-pty；`mod.rs` 管理会话与 Tauri 命令。

最多四个会话，每个会话一个阻塞读取线程，输出仅保留最近 256 KiB。关闭和退出应用回收 Shell 与读取任务。主窗口及桌面拉起的本机 Agent 可使用，不记录输入输出，不提供远程 Shell。

`agent_bridge.rs` 是父进程注入令牌的 loopback 私有通道；TypeScript 工具通过它复用同一 Runtime、PTY 和回放。Agent 命令独立运行，完成输出保留；容量不足时仅回收已消费的 Agent 终端。契约见 `docs/api/2026-10-14-terminal-action.md`。

科研能力3通过私有 run(cwd, program, args, jobId) 直接创建 PTY 程序，不拼接 shell 字符串。科研与开发的 Agent 终端均只读，禁止手工写入绕过计划权限；停止与回放沿用 Runtime。stopJob 按科研作业身份回收，用于暂停和 Server 恢复核对。同一已保留 jobId 与相同参数返回原终端，不重复启动；身份绑定不同命令拒绝。契约见 [科研核心工具](../../../../docs/api/2026-10-18-research-tools.md)。
