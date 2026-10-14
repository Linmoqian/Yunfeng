# 工作台终端

`model.rs` 负责 IPC 类型、边界和输出缓存；`session.rs` 封装 portable-pty；`mod.rs` 管理会话与 Tauri 命令。

最多四个会话，每个会话一个阻塞读取线程，输出仅保留最近 256 KiB。关闭和退出应用回收 Shell 与读取任务。仅主窗口可使用，不记录输入输出，不提供远程 Shell。
