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
import { visibleWidth, stripTerminalSequences } from "./utils.js";
import { parseKey } from "./terminal/input.js";

/** 组件接口：渲染成行 + 可选输入处理。height 为可用高度（主轴为纵向的布局组件使用） */
export interface Component {
	render(width: number, height?: number): string[];
	handleInput?(data: string): boolean;
	wantsKeyRelease?: boolean;
	invalidate(): void;
}

/** 可聚焦组件：渲染时发射 CURSOR_MARKER 供 TUI 定位硬件光标 */
export interface Focusable {
	focused: boolean;
}

export function isFocusable(c: Component | null): c is Component & Focusable {
	return !!c && "focused" in c;
}

/** 光标位置标记：APC 序列（零宽，终端忽略），TUI 据此定位硬件光标 */
export const CURSOR_MARKER = "\u001B_pi:c\u0007";

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
export type TuiMode = "regular" | "fullscreen";

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
}

/**
 * TUI 抽象基类：负责子组件挂载、焦点管理、输入分发、render 节流与差分渲染骨架。
 * 具体的渲染目标（主屏/全屏）由子类 doRender 覆盖。
 */
export abstract class TuiBase extends Container {
	readonly abstract mode: TuiMode;
	abstract terminal: Terminal;

	protected focusedComponent: Component | null = null;
	private inputListeners: TuiInputListener[] = [];
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
			const line = lines[i] ?? "";
			const idx = line.indexOf(CURSOR_MARKER);
			if (idx !== -1) {
				const before = line.slice(0, idx);
				const col = visibleWidth(stripTerminalSequences(before));
				return { row: i, col };
			}
		}
		return null;
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

	addInputListener(listener: TuiInputListener): () => void {
		this.inputListeners.push(listener);
		return () => {
			this.inputListeners = this.inputListeners.filter((l) => l !== listener);
		};
	}

	private handleTerminalInput(data: string): void {
		// 拆分为单个键事件逐个分发（终端可能批量送达多键）
		let buffer = data;
		while (buffer.length > 0) {
			let keyData: string;
			const parsed = parseKey(buffer);
			if (parsed) {
				keyData = buffer.slice(0, parsed.consumed);
				buffer = buffer.slice(parsed.consumed);
			} else {
				keyData = buffer.slice(0, 1);
				buffer = buffer.slice(1);
			}
			// 让监听器有机会改写/消费
			let message = keyData;
			for (const listener of this.inputListeners) {
				const res = listener(message);
				if (res) {
					if (res.data !== undefined) message = res.data;
					if (res.consume) break;
				}
			}
			const target = this.focusedComponent;
			if (target?.handleInput?.(message)) {
				this.requestRender();
			}
		}
	}

	start(): void {
		this.terminal.start((d) => this.handleTerminalInput(d), () => this.onResize());
		this.requestRender();
	}

	stop(opts?: TuiStopOptions): void {
		this.stopped = true;
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
		this.terminal.stop();
	}

	protected onResize(): void {
		this.requestRender();
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
