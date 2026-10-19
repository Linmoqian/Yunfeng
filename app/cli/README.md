# Yunfeng CLI

独立 pnpm workspace，`packages/` 包含 TUI、CLI、Agent、模型适配和协议。普通消息当前使用模拟回复，真实 Agent 接入仍需单独实施。

在本目录执行：

```sh
pnpm install
pnpm cli
pnpm test
pnpm smoke
```

根目录 workspace 不安装此处依赖；沿用本目录的 `pnpm-workspace.yaml` 与锁文件。桌面与移动端入口见[客户端索引](../README.md)。
