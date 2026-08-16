# @yunfeng/cli 入口架构

`@yunfeng/cli` 是 Yunfeng coding agent CLI 的可执行入口：组装 `@yunfeng/tui` 的组件为完整应用并启动。当前版本只做 **TUI 主界面**，不包含 agent / LLM 业务。

源文件：

- `src/app.ts`：应用组装（布局、命令服务、占位 agent 回执）
- `src/commands.ts`：斜杠命令表与帮助文案
- `src/index.ts`：包级导出与直接运行入口

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
	tui: TuiMainScreen | TuiFullScreen;
	messages: Messages;
	editor: Editor;
	status: StatusBar;
}

interface CreateAppOptions {
	animate?: boolean; // 是否启用吉祥物浮动动画
	onQuit?: () => void; // Ctrl+C / /quit 回调（默认 process.exit(0)）
	screen?: 'main' | 'full'; // 主屏（保留 scrollback）或全屏（alt screen）
	cwd?: string; // 工作目录（默认 process.cwd()）
}
```

组装内容：

- 布局：`Header` + `Mascot（吉祥物）` + `Messages（grow:1）` + `Loader` + `Editor`；`StatusBar` 固定为 footer
- 交互：
  - 回车提交：`/` 开头走命令表，普通文本写入消息流（user + assistant 占位回执），随后清空编辑器
  - 斜杠命令：`/help`（帮助弹层）、`/clear`（清空消息流）、`/model`（模型选择器）、
    `/theme light|dark`（切换主题，不带参数打开选择器）、`/quit`（退出）
  - 全局快捷键：`Ctrl+C` 退出（调 `onQuit`）、`Ctrl+L` 清屏
- 焦点初始落在 `Editor`；硬件光标开启（IME）

### main()

使用真实终端（`ProcessTerminal`，含颜色能力与明暗主题探测）创建并 `start()`。`--fullscreen` 或 `YUNFENG_TUI_SCREEN=fullscreen` 进入全屏模式；文件被直接执行（`bin` / `node dist/index.js`）时自动调用。

## 运行方式

```bash
npm run cli        # 开发期：tsx 直接运行 src
npm run build      # 构建 tui + cli（dist）
node packages/cli/dist/index.js   # 运行构建产物
# 安装后：yunfeng（bin）
```

## 测试

`packages/cli/test/index.test.ts` 用内存终端注入 `createApp`，验证：

- 首帧渲染（品牌头部 / 欢迎文案 / 吉祥物 / 状态栏）
- 提交写入消息流并清空编辑器
- `Ctrl+C` 触发 `onQuit`
- grow 布局让编辑器与状态栏沉底
- 全屏模式进入/退出 alt screen
- `/help`、`/clear`、`/model`、`/theme`、`/quit` 命令流

## 后续扩展点（未实现）

- `packages/agent` / `packages/ai` / `packages/protocol` 仍为 placeholder；接入 agent 后，
  `Messages` 由事件池驱动、`StatusBar` 填充模型/token/开销、`Editor` 提交走 agent 调用。
- 会话恢复（`/resume`）、任务列表（`/tasks`）等真实工作流命令仍待接入；
  `/model` 已提供选择器交互，但选项仍是占位目录。
