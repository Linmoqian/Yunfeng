/**
 * TuiMainScreen：渲染进终端主屏（scrollback 可见区）。
 * 实现差分渲染：只输出变化部分，尽量保留滚动区。
 */
import { TuiBase, type Terminal, type TuiMode, type TuiStopOptions } from "./tui.js";

export interface TuiMainScreenOptions {
	terminal: Terminal;
	showHardwareCursor?: boolean;
}

export class TuiMainScreen extends TuiBase {
	readonly mode: TuiMode = "regular";
	terminal: Terminal;

	constructor(opts: TuiMainScreenOptions) {
		super();
		this.terminal = opts.terminal;
		this.showHardwareCursor = opts.showHardwareCursor ?? false;
	}

	protected override onResize(): void {
		// 尺寸变化需强制全量重绘
		super.onResize();
	}

	protected doRender(): void {
		this.renderFrame();
	}

	override stop(opts?: TuiStopOptions): void {
		super.stop(opts);
	}
}

interface ComponentPart {
	text: string;
	component: unknown;
}
