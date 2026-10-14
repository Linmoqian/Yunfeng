# CLAUDE.md

这是兼容助手的项目入口。身份、交流、工作区保护、技术栈、验证和 Git 规则统一以 [AGENTS.md](AGENTS.md) 为准；工程师当前指令优先。

开始工作先读取 AGENTS.md，并检查 Git 状态与 [TODO.md](TODO.md)。按改动范围加载 `.agents/skills/` 中的对应技能。只提交当前任务的差异，保留工程师已有改动。

当前架构见 [README.md](README.md) 和[运行架构](docs/development/2026-10-15-runtime-architecture.md)，专题文档见[索引](docs/README.md)。Server 使用 Pi SDK，配置独立在 `.lin`；TUI 与 `server-rpc` 的边界以当前架构说明为准。

本文件不再复制工程规范或另行维护目录、命令和依赖清单。
