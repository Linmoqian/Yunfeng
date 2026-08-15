/**
 * TUI 核心：组件接口、容器、Abstract TUI 基类与差分渲染。
 *
 * 差分渲染模型（参照 pi）：
 * - 保存 previousLines，渲染时逐行比对，只输出变化部分
 * - 支持滚 scrollback（首屏空出新行，末尾写入新内容）
 * - 提供 requestRender 节流调度
 *
 * v1 不接 agent/LLM，只做交互底座。
 */
import { visibleWidth, stripTerminalSequences } from './utils.js';
import { type Key } from './terminal/input.js';
import { StdinBuffer } from './terminal/stdin-buffer.js';
import { applyDetectedThemeMode, type ThemeMode } from './theme.js';

/** 组件接口：渲染成行 + 可选输入处理。height 为可用高度（主轴为纵向的布局组件使用） */
export interface Component {
	render(width: number, height?: number): string[];
	handleInput?(data: string): boolean;
	wantsKeyRelease?: boolean;
	invalidate(): void;
	/** 组件销毁时释放资源（定时器、订阅等）；由 TuiBase.stop 遍历调用 */
	dispose?(): void;
}

/** 可聚焦组件：渲染时发射 CURSOR_MARKER 供 TUI 定位硬件光标 */
export interface Focusable {
	focused: boolean;
}

export function isFocusable(c: Component | null): c is Component & Focusable {
	return !!c && 'focused' in c;
}

/** 光标位置标记：APC 序列（零宽，终端忽略），TUI 据此定位硬件光标 */
export const CURSOR_MARKER = '\u001B_pi:c\u0007';

/**
 * Container：持有并渲染子组件的容器。不进行排版，只纵向堆叠子组件。
 */
export class Container implements Component {
	children: Component[] = [];

	addChild(component: Component): void {
		this.children.push(component);
		this.invalidate();
	}
	removeChild(component: Component): void {
		this.children = this.children.filter((c) => c !== component);
		this.invalidate();
	}
	clear(): void {
		this.children = [];
		this.invalidate();
	}
	invalidate(): void {
		for (const c of this.children) c.invalidate();
	}
	/** 递归调用所有子组件的 dispose（含嵌套容器） */
	disposeChildren(): void {
		for (const c of this.children) {
			if (c instanceof Container) {
				c.disposeChildren();
			} else {
				c.dispose?.();
			}
		}
	}
	render(width: number): string[] {
		const lines: string[] = [];
		for (const c of this.children) lines.push(...c.render(width));
		return lines;
	}
}

/** 输入监听器返回值：可选择消费/改写输入 */
export type TuiInputListenerResult = { consume?: boolean; data?: string } | undefined;
export type TuiInputListener = (data: string) => TuiInputListenerResult;

export interface TuiStopOptions {
	/** 留给后续接管同一终端的 TUI */
	preserveScreen?: boolean;
}

/** TUI 渲染模式 */
export type TuiMode = 'regular' | 'fullscreen';

/** 终端抽象：TUI 与外界的唯一 I/O 边界 */
export interface Terminal {
	start(onInput: (d: string) => void, onResize: () => void): void;
	stop(): void;
	write(data: string): void;
	get columns(): number;
	get rows(): number;
	hideCursor(): void;
	showCursor(): void;
	clearScreen(): void;
	/** 可选：查询终端前/背景色（OSC 10/11），结果通过 onThemeMode 回报 */
	queryColorScheme?(): void;
	/** 可选：终端探测到明暗主题时回调（由 TuiBase 在 start 时挂接） */
	onThemeMode?: ((mode: ThemeMode) => void) | null;
}

/**
 * TUI 抽象基类：负责子组件挂载、焦点管理、输入分发、render 节流与差分渲染骨架。
 * 具体的渲染目标（主屏/全屏）由子类 doRender 覆盖。
 */
export abstract class TuiBase extends Container {
	abstract readonly mode: TuiMode;
	abstract terminal: Terminal;

	/** 当前模态弹层；存在时只渲染弹层并接管渲染面 */
	overlay: Component | null = null;
	/** 底部固定栏（如状态栏）：永远渲染在屏幕最底行，不参与内容区布局 */
	private footer: Component | null = null;
	/** 是否在渲染后定位硬件光标（IME） */
	protected showHardwareCursor = false;

	protected focusedComponent: Component | null = null;
	private inputListeners: TuiInputListener[] = [];
	/** 流式输入缓冲（跨事件半包合并） */
	private stdinBuffer = new StdinBuffer();
	/** 全局快捷键：优先于组件输入处理；handler 返回 true 表示消费 */
	private globalShortcuts = new Map<string, (key: Key) => boolean>();
	private renderRequested = false;
	private renderTimer: ReturnType<typeof setTimeout> | null = null;
	private static readonly MIN_RENDER_INTERVAL = 16;

	// —— 差分渲染状态 ——
	protected previousLines: string[] = [];
	protected previousWidth = 0;
	protected previousHeight = 0;
	protected maxLinesRendered = 0;
	/** 已渲染内容最顶行（用于首屏滚动） */
	protected cursorRow = 0;
	protected stopped = false;

	/** 从渲染结果中提取并剥离 CURSOR_MARKER 对应的硬件光标位置 */
	protected extractCursorPosition(lines: string[], height: number): { row: number; col: number } | null {
		// 只扫描可见视口底部 height 行
		const start = Math.max(0, lines.length - height);
		for (let i = lines.length - 1; i >= start; i--) {
			const line = lines[i] ?? '';
			const idx = line.indexOf(CURSOR_MARKER);
			if (idx !== -1) {
				const before = line.slice(0, idx);
				const col = visibleWidth(stripTerminalSequences(before));
				return { row: i, col };
			}
		}
		return null;
	}

	/**
	 * 定位硬件光标（IME）：[<row>;<col>H 后显示光标。
	 * row/col 为 0-based，输出时转 1-based。
	 */
	protected positionCursor(row: number, col: number, _height: number): void {
		const r = row + 1;
		const c = col + 1;
		this.terminal.write(`\x1b[${r};${c}H\x1b[?25h`);
	}

	/**
	 * 逐行差分：对比当前行与上一帧，返回需要输出的终端序列，并更新上一帧状态。
	 * - 尺寸变化：全量重绘（移到原点逐行清行写）
	 * - 行内容变化：仅对变化行做光标定位 + 清行 + 写入，保留其余区域
	 * - 无变化：返回 null（不输出任何字节）
	 */
	protected diffAndBuild(current: string[], w: number, h: number): string | null {
		const previous = this.previousLines;
		const prevW = this.previousWidth;
		const prevH = this.previousHeight;
		const full = w !== prevW || h !== prevH;
		const dirty: number[] = [];
		if (full) {
			for (let i = 0; i < Math.min(current.length, h); i++) dirty.push(i);
		} else {
			const n = Math.max(current.length, previous.length);
			for (let i = 0; i < n; i++) {
				if ((current[i] ?? '') !== (previous[i] ?? '')) dirty.push(i);
			}
		}
		// 更新上一帧状态（即使无变化也同步，供下次比对）
		this.previousLines = current;
		this.previousWidth = w;
		this.previousHeight = h;
		if (dirty.length === 0) return null;

		let out = '';
		if (full) out += '\x1b[H';
		for (const row of dirty) {
			if (row >= h) break;
			const line = current[row] ?? '';
			if (full) {
				out += '\x1b[2K' + line + '\x1b[0m\n';
			} else {
				// 定位到目标行（1-based）再清行写入
				out += `\x1b[${row + 1};1H\x1b[2K${line}\x1b[0m`;
			}
		}
		return out;
	}

	setFocus(component: Component | null): void {
		if (this.focusedComponent === component) return;
		if (this.focusedComponent && isFocusable(this.focusedComponent)) {
			this.focusedComponent.focused = false;
		}
		this.focusedComponent = component;
		if (component && isFocusable(component)) {
			component.focused = true;
		}
		this.requestRender();
	}

	getFocusedComponent(): Component | null {
		return this.focusedComponent;
	}

	/** 设置底部固定栏（如状态栏）；始终渲染在屏幕最底行 */
	setFooter(component: Component | null): void {
		this.footer = component;
		this.requestRender();
	}

	/** 打开模态弹层；可选把焦点移交给弹层内的目标组件 */
	openOverlay(overlay: Component, focusTarget?: Component | null): void {
		this.overlay = overlay;
		if (focusTarget) this.setFocus(focusTarget);
		this.requestRender();
	}

	/** 关闭模态弹层 */
	closeOverlay(): void {
		this.overlay = null;
		this.requestRender();
	}

	addInputListener(listener: TuiInputListener): () => void {
		this.inputListeners.push(listener);
		return () => {
			this.inputListeners = this.inputListeners.filter((l) => l !== listener);
		};
	}

	/**
	 * 注册全局快捷键。handler 在输入分发给组件之前执行，返回 true 表示消费该键。
	 * @returns 取消注册函数
	 */
	addGlobalShortcut(name: string, handler: (key: Key) => boolean): () => void {
		this.globalShortcuts.set(name, handler);
		return () => {
			this.globalShortcuts.delete(name);
		};
	}

	private dispatchGlobalShortcut(key: Key): boolean {
		for (const handler of this.globalShortcuts.values()) {
			if (handler(key)) return true;
		}
		return false;
	}

	private handleTerminalInput(data: string): void {
		// 经 StdinBuffer 合并跨事件半包后，按完整按键逐个分发
		this.stdinBuffer.feed(data, (chunk, key) => this.dispatchKey(chunk, key));
	}

	private dispatchKey(keyData: string, key: Key): void {
		// 全局快捷键优先于组件
		if (this.dispatchGlobalShortcut(key)) return;
		// 让监听器有机会改写/消费
		let message = keyData;
		let consumed = false;
		for (const listener of this.inputListeners) {
			const res = listener(message);
			if (res) {
				if (res.data !== undefined) message = res.data;
				if (res.consume) {
					consumed = true;
					break;
				}
			}
		}
		// 消费后不再转发给焦点组件
		if (consumed) return;
		const target = this.focusedComponent;
		if (target?.handleInput?.(message)) {
			this.requestRender();
		}
	}
	start(): void {
		// 主题探测回调需在 terminal.start 前挂接；auto 偏好下查询结果到达时自动重绘
		this.terminal.onThemeMode = (mode) => {
			applyDetectedThemeMode(mode);
			this.requestRender();
		};
		this.terminal.start(
			(d) => this.handleTerminalInput(d),
			() => this.onResize(),
		);
		this.terminal.queryColorScheme?.();
		this.requestRender();
	}

	stop(opts?: TuiStopOptions): void {
		void opts;
		this.stopped = true;
		this.stdinBuffer.clear();
		this.terminal.onThemeMode = null;
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
		this.disposeChildren();
		this.terminal.stop();
	}

	protected onResize(): void {
		this.requestRender();
	}

	/**
	 * 公共渲染帧：装配内容（弹层存在时只渲染弹层）、逐行差分输出、光标定位。
	 * 子类 doRender 直接调用。
	 */
	protected renderFrame(): void {
		const width = this.terminal.columns;
		const height = this.terminal.rows;
		const sources = this.overlay ? [this.overlay] : this.children;
		// footer 固定底部：内容区高度 = 总高 - footer 行数
		const footerLines = this.overlay ? [] : (this.footer?.render(width, height) ?? []);
		const contentHeight = Math.max(1, height - footerLines.length);
		const content: string[] = [];
		sources.forEach((c) => {
			content.push(...c.render(width, contentHeight));
		});
		const visible = content.slice(-contentHeight);
		const allLines = [...visible, ...footerLines];
		const cursorPos = this.extractCursorPosition(allLines, height);
		const lines = allLines.map((l) => l.split(CURSOR_MARKER).join(''));

		const output = this.diffAndBuild(lines, width, height);
		if (output !== null) {
			this.terminal.write(output);
		}

		// 定位硬件光标（IME）
		if (this.showHardwareCursor && cursorPos) {
			this.positionCursor(cursorPos.row, cursorPos.col, height);
		} else {
			this.terminal.hideCursor();
		}
	}

	protected abstract doRender(): void;

	/** 立即渲染（force 忽略节流） */
	renderNow(force = false): void {
		if (this.stopped) return;
		if (!force && Date.now() - this.lastRenderAt < TuiBase.MIN_RENDER_INTERVAL) {
			this.requestRender();
			return;
		}
		this.doRender();
		this.lastRenderAt = Date.now();
		this.renderRequested = false;
	}

	private lastRenderAt = 0;

	/** 请求渲染（合并 16ms 内多次） */
	requestRender(): void {
		if (this.renderRequested) return;
		this.renderRequested = true;
		if (this.renderTimer) clearTimeout(this.renderTimer);
		this.renderTimer = setTimeout(() => {
			this.renderTimer = null;
			this.renderNow();
		}, TuiBase.MIN_RENDER_INTERVAL);
	}

	override invalidate(): void {
		super.invalidate();
	}
}

/** 选择器接口检测（占位用，避免空文件） */
export function isOverlayTarget(c: Component): boolean {
	return !!c;
}
