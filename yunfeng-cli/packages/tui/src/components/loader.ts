/**
 * Loader：spinner 加载指示组件（模仿 pi 的 loader）。
 * active 时渲染 spinner + 消息并驱动帧动画；非 active 不占行。
 * 动画由内部定时器驱动，onFrame 通知 TUI 重绘。
 */
import { style } from '../terminal/ansi.js';
import type { Component } from './component.js';

const DEFAULT_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface LoaderOptions {
	/** spinner 帧（空数组隐藏指示器） */
	frames?: string[];
	/** 帧间隔 ms */
	intervalMs?: number;
	/** 帧变化回调（外部据此 requestRender） */
	onFrame?: () => void;
}

export class Loader implements Component {
	private message: string;
	private frames: string[];
	private intervalMs: number;
	private currentFrame = 0;
	private timer: ReturnType<typeof setInterval> | null = null;
	private onFrame?: () => void;
	private active = false;

	constructor(message = '加载中...', options: LoaderOptions = {}) {
		this.message = message;
		this.frames = options.frames ?? DEFAULT_FRAMES;
		this.intervalMs = options.intervalMs ?? 80;
		this.onFrame = options.onFrame;
	}

	invalidate(): void {}

	setMessage(message: string): void {
		this.message = message;
	}

	/** 激活/停止：激活时显示 spinner 并启动动画 */
	setActive(active: boolean): void {
		this.active = active;
		if (active) this.start();
		else this.stop();
	}

	start(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % Math.max(1, this.frames.length);
			this.onFrame?.();
		}, this.intervalMs);
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	dispose(): void {
		this.stop();
	}

	render(_width: number): string[] {
		if (!this.active) return [];
		const frame = this.frames[this.currentFrame] ?? '';
		return [style(`${frame} ${this.message}`, { fg: '#a855f7' })];
	}
}
