# @yunfeng/cli 入口架构

`@yunfeng/cli` 是 Yunfeng coding agent CLI 的可执行入口：组装 `@yunfeng/tui` 的组件为完整应用并启动。当前版本只做 **TUI 主界面**，不包含 agent / LLM 业务。

## 依赖关系

```
@yunfeng/cli  ──dependencies──▶  @yunfeng/tui
```

- `@yunfeng/cli` 通过 `@yunfeng/tui` 的包级导出（`dist/index.js`）引用组件与终端实现。
- 构建顺序由根脚本保证：`npm run build` 先构建 `@yunfeng/tui` 再构建 `@yunfeng/cli`。
- `bin` 暴露 `yunfeng` 命令，指向 `dist/index.js`（带 `#!/usr/bin/env node`）。

## 入口契约

### createApp(terminal, options): CliApp

组装完整应用但**不启动**，便于测试注入终端：

```ts
interface CliApp {
	tui: TuiMainScreen;
	messages: Messages;
	editor: Editor;
}

interface CreateAppOptions {
	animate?: boolean; // 是否启用吉祥物浮动动画
	onQuit?: () => void; // Ctrl+C 退出回调（默认 process.exit(0)）
}
```

组装内容：

- 布局：`Mascot（吉祥物）` + `Messages（grow:1）` + `Editor` + `StatusBar`
- 交互：
  - 回车提交：编辑器内容写入消息流（user + assistant 回执），随后清空编辑器
  - 全局快捷键：`Ctrl+C` 退出（调 `onQuit`）、`Ctrl+L` 清屏
- 焦点初始落在 `Editor`；硬件光标开启（IME）

### main()

使用真实终端（`ProcessTerminal`，含颜色能力探测）创建并 `start()`。文件被直接执行（`bin` / `node dist/index.js`）时自动调用。

## 运行方式

```bash
npm run cli        # 开发期：tsx 直接运行 src
npm run build      # 构建 tui + cli（dist）
node packages/cli/dist/index.js   # 运行构建产物
# 安装后：yunfeng（bin）
```

## 测试

`packages/cli/test/index.test.ts` 用内存终端注入 `createApp`，验证：

- 首帧渲染（欢迎文案 / 吉祥物 / 状态栏）
- 提交写入消息流并清空编辑器
- `Ctrl+C` 触发 `onQuit`
- grow 布局让编辑器与状态栏沉底

## 后续扩展点（未实现）

- `packages/agent` / `packages/ai` / `packages/protocol` 仍为 placeholder；接入 agent 后，
  `Messages` 由事件池驱动、`StatusBar` 填充模型/token/开销、`Editor` 提交走 agent 调用。
- 会话恢复（`/resume`）、模型选择（`/model`）可复用 `Overlay` + `Selector`。
