#!/usr/bin/env node
/**
 * @yunfeng/cli 入口：启动 Yunfeng TUI 主界面。
 *
 * - createApp(terminal)：注入终端构建完整应用（便于测试与复用）
 * - main()：使用真实终端启动
 * - 直接运行时自动执行 main（bin: yunfeng）
 */
import {
	TuiMainScreen,
	ProcessTerminal,
	VStack,
	Messages,
	Editor,
	StatusBar,
	Mascot,
	Loader,
	CombinedAutocompleteProvider,
	CommandProvider,
	FileProvider,
	type Terminal,
} from '@yunfeng/tui';

export interface CliApp {
	tui: TuiMainScreen;
	messages: Messages;
	editor: Editor;
}

export interface CreateAppOptions {
	/** 是否启用吉祥物浮动动画（真实终端建议开启） */
	animate?: boolean;
	/** Ctrl+C 退出回调（默认 process.exit(0)；测试可注入） */
	onQuit?: () => void;
}

/** 组装完整 TUI 应用（不启动，由调用方 start） */
export function createApp(terminal: Terminal, opts: CreateAppOptions = {}): CliApp {
	const messages = new Messages([
		{ role: 'system', from: 'yunfeng', content: '欢迎使用 yunfeng-cli TUI' },
		{ role: 'assistant', from: 'assistant', content: '在底部输入框打字，Ctrl+C 退出。' },
	]);
	const editor = new Editor('', { submitOnEnter: true });
	const loader = new Loader('思考中...', { onFrame: () => tui.requestRender() });
	const status = new StatusBar(() => ({
		cwd: process.cwd(),
		sessionName: 'yunfeng',
		// 占位示例：接入 agent 后由真实运行数据覆盖
		model: 'yunfeng-demo',
		contextUsed: 12480,
		contextLimit: 128000,
		reasoning: 'medium',
	}));

	const tui = new TuiMainScreen({ terminal, showHardwareCursor: true });
	const mascot = new Mascot({
		animate: opts.animate ?? false,
		intervalMs: 500,
		onFrame: () => tui.requestRender(),
	});

	const layout = new VStack([
		{ component: mascot },
		{ component: messages, grow: 1 },
		{ component: loader },
		{ component: editor },
		{ component: status },
	]);
	tui.addChild(layout);
	tui.setFocus(editor);

	// 自动补全：斜杠命令 + 当前目录文件（模仿 pi）
	editor.setAutocompleteProvider(
		new CombinedAutocompleteProvider([
			new CommandProvider([
				{ name: 'help', description: '显示帮助' },
				{ name: 'clear', description: '清屏' },
				{ name: 'quit', description: '退出' },
				{ name: 'model', description: '选择模型' },
			]),
			new FileProvider(process.cwd()),
		]),
	);

	// 提交：Editor Enter 触发 onSubmit（模仿 pi 聊天输入），写入消息流
	editor.onSubmit = (text) => {
		const line = text.trim();
		if (line) {
			messages.add({ role: 'user', from: 'you', content: line });
			// 模拟 agent 响应：显示思考中 spinner，随后回执（接 agent 后由真实异步替换）
			loader.setMessage(`思考中：${line}`);
			loader.setActive(true);
			tui.requestRender();
			setTimeout(() => {
				loader.setActive(false);
				messages.add({ role: 'assistant', from: 'assistant', content: `收到：${line}` });
				tui.requestRender();
			}, 1200);
		}
	};

	// 全局快捷键：Ctrl+C 退出、Ctrl+L 清屏
	const quit = opts.onQuit ?? (() => process.exit(0));
	tui.addGlobalShortcut('quit', (key) => {
		if (key.kind === 'ctrl' && key.value === 'c') {
			terminal.showCursor();
			quit();
			return true;
		}
		return false;
	});
	tui.addGlobalShortcut('clear', (key) => {
		if (key.kind === 'ctrl' && key.value === 'l') {
			terminal.clearScreen();
			tui.requestRender();
			return true;
		}
		return false;
	});

	return { tui, messages, editor };
}

/** 使用真实终端启动 */
export function main(): void {
	const terminal = new ProcessTerminal();
	const { tui } = createApp(terminal);
	tui.start();
}

// 直接运行（bin / node dist/index.js）时启动；被 import 时不启动
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
	main();
}
