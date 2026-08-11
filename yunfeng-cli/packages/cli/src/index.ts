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
	const editor = new Editor('');
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
		{ component: editor },
		{ component: status },
	]);
	tui.addChild(layout);
	tui.setFocus(editor);

	// 提交：回车把输入写入消息流
	tui.addInputListener((data) => {
		if (data === '\r' || data === '\n') {
			const line = editor.value.trim();
			if (line) {
				messages.add({ role: 'user', from: 'you', content: line });
				messages.add({ role: 'assistant', from: 'assistant', content: `收到：${line}` });
				editor.value = '';
				editor.cursor = 0;
				tui.requestRender();
			}
		}
		return { consume: false };
	});

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
