/**
 * @yunfeng/cli 应用组装：把 @yunfeng/tui 组件组合为 Yunfeng TUI 主界面。
 *
 * - createApp(terminal, options)：组装完整应用但不启动，便于测试注入终端
 * - main()：使用真实终端启动；--fullscreen / YUNFENG_TUI_SCREEN=fullscreen 进入全屏
 *
 * 当前仍是交互底座：普通消息由占位回执模拟，接入 agent 后替换。
 */
import {
	CombinedAutocompleteProvider,
	CommandProvider,
	Editor,
	FileProvider,
	Header,
	Loader,
	Markdown,
	Mascot,
	Messages,
	Overlay,
	ProcessTerminal,
	Selector,
	StatusBar,
	TuiFullScreen,
	TuiMainScreen,
	VStack,
	getYunfengThemeMode,
	setThemePreference,
	type SelectOption,
	type Terminal,
} from '@yunfeng/tui';
import { COMMAND_SPECS, HELP_TEXT, runCommand } from './commands.js';

export type CliScreenMode = 'main' | 'full';
export type CliTui = TuiMainScreen | TuiFullScreen;

export interface CliApp {
	tui: CliTui;
	messages: Messages;
	editor: Editor;
	status: StatusBar;
}

export interface CreateAppOptions {
	/** 是否启用吉祥物浮动动画（默认 false） */
	animate?: boolean;
	/** Ctrl+C / /quit 退出回调（默认 process.exit(0)；测试可注入） */
	onQuit?: () => void;
	/** 渲染目标：主屏保留 scrollback，全屏使用 alt screen */
	screen?: CliScreenMode;
	/** 工作目录（默认 process.cwd()，测试可注入） */
	cwd?: string;
}

/** 占位模型目录：接入 agent 后由真实模型目录替换 */
const MODEL_OPTIONS: SelectOption[] = [
	{ value: 'yunfeng:demo', label: 'yunfeng:demo', detail: '占位模型（接入 agent 后替换）' },
	{ value: 'pi:compatible', label: 'pi:compatible', detail: 'pi 兼容适配占位（未接入）' },
];

/** 组装完整 TUI 应用（不启动，由调用方 start） */
export function createApp(terminal: Terminal, opts: CreateAppOptions = {}): CliApp {
	const cwd = opts.cwd ?? process.cwd();
	const messages = new Messages([
		{ role: 'system', from: 'yunfeng', content: '欢迎使用 yunfeng-cli TUI' },
		{ role: 'assistant', from: 'assistant', content: '在底部输入框打字，/help 查看命令，Ctrl+C 退出。' },
	]);
	const editor = new Editor('', { submitOnEnter: true });
	const tui =
		opts.screen === 'full'
			? new TuiFullScreen({ terminal, showHardwareCursor: true })
			: new TuiMainScreen({ terminal, showHardwareCursor: true });
	const loader = new Loader('思考中...', { onFrame: () => tui.requestRender() });
	let model = MODEL_OPTIONS[0]!.value;
	const sessionName = '新会话';
	const status = new StatusBar(() => ({
		cwd,
		sessionName,
		// 占位示例：接入 agent 后由真实运行数据覆盖
		model,
		contextUsed: 12480,
		contextLimit: 128000,
		reasoning: 'medium',
	}));

	const mascot = new Mascot({
		animate: opts.animate ?? false,
		intervalMs: 500,
		onFrame: () => tui.requestRender(),
	});
	const header = new Header(() => ({ detail: `${sessionName} · ${model}` }));

	// 状态栏作为独立 footer：永远固定屏幕底部，不参与内容区布局
	tui.setFooter(status);

	const layout = new VStack([
		{ component: header },
		{ component: mascot },
		{ component: messages, grow: 1 },
		{ component: loader },
		{ component: editor },
	]);
	tui.addChild(layout);
	tui.setFocus(editor);

	// 自动补全：斜杠命令 + 当前目录文件（模仿 pi）
	editor.setAutocompleteProvider(
		new CombinedAutocompleteProvider([new CommandProvider(COMMAND_SPECS), new FileProvider(cwd)]),
	);

	const closeOverlay = (): void => {
		tui.closeOverlay();
		tui.setFocus(editor);
	};

	const showHelp = (): void => {
		const overlay = new Overlay({
			title: '帮助',
			content: new Markdown(HELP_TEXT),
			width: Math.min(72, Math.max(40, terminal.columns - 4)),
			onClose: closeOverlay,
		});
		tui.openOverlay(overlay, overlay);
	};

	const openPicker = (
		title: string,
		options: SelectOption[],
		selected: number,
		onSelect: (option: SelectOption) => void,
	): void => {
		const selector = new Selector(options, selected, {
			onSelect: (option) => {
				onSelect(option);
				closeOverlay();
			},
			onCancel: closeOverlay,
		});
		const overlay = new Overlay({
			title,
			content: selector,
			width: Math.min(72, Math.max(40, terminal.columns - 4)),
		});
		tui.openOverlay(overlay, selector);
	};

	const chooseModel = (): void => {
		const selected = Math.max(
			0,
			MODEL_OPTIONS.findIndex((option) => option.value === model),
		);
		openPicker('选择模型', MODEL_OPTIONS, selected, (option) => {
			model = option.value;
			messages.add({ role: 'system', from: 'yunfeng', content: `已选择模型 ${option.value}。` });
		});
	};

	const chooseTheme = (argument?: string): void => {
		if (argument === 'light' || argument === 'dark') {
			setThemePreference(argument);
			tui.requestRender();
			return;
		}
		const options: SelectOption[] = [
			{ value: 'light', label: 'light', detail: '浅色主题' },
			{ value: 'dark', label: 'dark', detail: '深色主题' },
		];
		openPicker('选择主题', options, getYunfengThemeMode() === 'light' ? 0 : 1, (option) => {
			if (option.value === 'light' || option.value === 'dark') {
				setThemePreference(option.value);
				messages.add({
					role: 'system',
					from: 'yunfeng',
					content: `已切换到${option.value === 'light' ? '浅色' : '深色'}主题。`,
				});
			}
		});
	};

	const quit = opts.onQuit ?? (() => process.exit(0));

	// 提交：斜杠命令走命令表，普通文本写入消息流（接入 agent 后替换）
	editor.onSubmit = (text) => {
		const line = text.trim();
		if (!line) return;
		if (line.startsWith('/')) {
			if (!runCommand(line, { clearMessages, showHelp, chooseModel, chooseTheme, quit: requestQuit })) {
				messages.add({ role: 'error', from: 'yunfeng', content: `未识别命令 ${line}，输入 /help 查看可用命令。` });
			}
			return;
		}
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
	};

	function clearMessages(): void {
		messages.items = [{ role: 'system', from: 'yunfeng', content: '消息流已清空。' }];
		messages.scroll = 0;
		tui.requestRender();
	}

	function requestQuit(): void {
		terminal.showCursor();
		quit();
	}

	// 全局快捷键：Ctrl+C 退出、Ctrl+L 清屏
	tui.addGlobalShortcut('quit', (key) => {
		if (key.kind === 'ctrl' && key.value === 'c') {
			requestQuit();
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

	return { tui, messages, editor, status };
}

/** 使用真实终端启动 */
export function main(): void {
	const fullscreen = process.argv.includes('--fullscreen') || process.env.YUNFENG_TUI_SCREEN === 'fullscreen';
	const terminal = new ProcessTerminal();
	const { tui } = createApp(terminal, { screen: fullscreen ? 'full' : 'main' });
	tui.start();
}
