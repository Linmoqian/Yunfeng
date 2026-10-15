# 工作台终端

`model.rs` 负责 IPC 类型、边界和输出缓存；`session.rs` 封装 portable-pty；`mod.rs` 管理会话与 Tauri 命令。

最多四个会话，每个会话一个阻塞读取线程，输出仅保留最近 256 KiB。关闭和退出应用回收 Shell 与读取任务。主窗口及桌面拉起的本机 Agent 可使用，不记录输入输出，不提供远程 Shell。

`agent_bridge.rs` 是父进程注入令牌的 loopback 私有通道；TypeScript 工具通过它复用同一 Runtime、PTY 和回放。Agent 命令独立运行，完成输出保留；容量不足时仅回收已消费的 Agent 终端。契约见 `docs/api/2026-10-14-terminal-action.md`。
