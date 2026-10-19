/**
 * ProcessTerminal：基于 process.stdin/stdout 的真实终端实现。
 * 进入 raw mode 逐键接收输入，提供尺寸与基础 ANSI 写方法。
 * 构造时探测终端颜色能力（NO_COLOR / TERM / COLORTERM）并配置渲染降级。
 */
import type { Terminal } from '../tui.js';
import { setColorMode, type ColorMode } from './ansi.js';
import { initYunfengTheme, parseOscColorReports, themeModeFromReports, type ThemeMode } from '../theme.js';

/**
 * 探测颜色渲染模式：
 * - NO_COLOR 设置或 TERM=dumb → none
 * - COLORTERM=truecolor / TERM 含 truecolor|direct → truecolor
 * - TERM 含 256color → 256
 * - 默认 truecolor（现代终端）
 */
export function detectColorMode(env: NodeJS.ProcessEnv = process.env, term?: string): ColorMode {
	if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 'none';
	const t = term ?? env.TERM ?? '';
	if (t === 'dumb') return 'none';
	if (env.COLORTERM === 'truecolor' || t.includes('truecolor') || t.includes('direct')) {
		return 'truecolor';
	}
	if (t.includes('256color')) return '256';
	return 'truecolor';
}

export class ProcessTerminal implements Terminal {
	private inputHandler: ((d: string) => void) | null = null;
	private resizeHandler: (() => void) | null = null;
	private stdin: NodeJS.ReadStream;
	/** 终端配色查询结果回调（由 TuiBase.start 挂接） */
	onThemeMode: ((mode: ThemeMode) => void) | null = null;

	constructor(
		stdin: NodeJS.ReadStream = process.stdin,
		private stdout: NodeJS.WriteStream = process.stdout,
	) {
		this.stdin = stdin;
		setColorMode(detectColorMode(process.env, process.env.TERM));
		initYunfengTheme(process.env);
	}

	start(onInput: (d: string) => void, onResize: () => void): void {
		this.inputHandler = onInput;
		this.resizeHandler = onResize;
		this.stdin.setRawMode?.(true);
		this.stdin.resume();
		this.stdin.setEncoding('utf8');
		this.stdin.on('data', this.dataHandler);
		this.stdout.on('resize', onResize);
	}

	/** 查询 OSC 10/11 终端配色；响应从输入流回收后经 onThemeMode 回报 */
	queryColorScheme(): void {
		this.write('\x1b]10;?\x07\x1b]11;?\x07');
	}

	private dataHandler = (data: Buffer | string): void => {
		const text = data.toString();
		const { reports, remainder } = parseOscColorReports(text);
		if (reports.length > 0) {
			const mode = themeModeFromReports(reports);
			if (mode) this.onThemeMode?.(mode);
		}
		// OSC 响应不应进入按键/编辑器输入流
		if (remainder.length > 0) this.inputHandler?.(remainder);
	};

	stop(): void {
		this.stdin.removeListener('data', this.dataHandler);
		this.stdout.removeListener('resize', this.resizeHandler!);
		this.stdin.setRawMode?.(false);
		this.stdin.pause();
	}

	write(data: string): void {
		this.stdout.write(data);
	}

	get columns(): number {
		return this.stdout.columns ?? 80;
	}

	get rows(): number {
		return this.stdout.rows ?? 24;
	}

	hideCursor(): void {
		this.write('\x1b[?25l');
	}

	showCursor(): void {
		this.write('\x1b[?25h');
	}

	clearScreen(): void {
		this.write('\x1b[2J\x1b[H');
	}
}
