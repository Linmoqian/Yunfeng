/**
 * TuiMainScreen：渲染进终端主屏（scrollback 可见区）。
 * 实现差分渲染：只输出变化部分，尽量保留滚动区。
 */
import { TuiBase, type Terminal, type TuiMode, type TuiStopOptions } from "./tui.js";
import { CURSOR_MARKER } from "./tui.js";

export interface TuiMainScreenOptions {
	terminal: Terminal;
	showHardwareCursor?: boolean;
}

export class TuiMainScreen extends TuiBase {
	readonly mode: TuiMode = "regular";
	terminal: Terminal;
	private showHardwareCursor: boolean;

	// 差分状态
	private prevLines: string[] = [];
	private prevWidth = 0;
	private prevHeight = 0;

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
		const width = this.terminal.columns;
		const height = this.terminal.rows;

		// 装配子组件行
		const content = new Array<ComponentPart>();
		// 直接渲染所有子组件（含 CURSOR_MARKER），传入可用高度供布局组件分配
		this.children.forEach((c) => {
			content.push(...c.render(width, height).map((line) => ({ text: line, component: c })));
		});
		let lines = content.map((p) => p.text);

		// 限制到可视高度
		const visible = lines.slice(-height);
		const cursorPos = this.extractCursorPosition(visible, height);
		// 剥离 CURSOR_MARKER
		lines = visible.map((l) => l.split(CURSOR_MARKER).join(""));

		const changed = this.diff(lines, this.prevLines, this.prevWidth, this.prevHeight, width, height);
		if (changed) {
			this.terminal.write(this.buildOutput(lines, width, height));
		}

		this.prevLines = lines;
		this.prevWidth = width;
		this.prevHeight = height;

		// 定位硬件光标（IME）
		if (this.showHardwareCursor && cursorPos) {
			this.positionCursor(cursorPos.row, cursorPos.col, height);
		} else {
			this.terminal.hideCursor();
		}
	}

	private buildOutput(lines: string[], width: number, height: number): string {
		// 移到起始，逐行清行后写
		let out = "\x1b[H";
		for (let i = 0; i < Math.min(lines.length, height); i++) {
			const line = lines[i] ?? "";
			out += "\x1b[2K" + line + "\x1b[0m\n";
		}
		return out;
	}

	private positionCursor(row: number, col: number, height: number): void {
		// \x1b[<row>;<col>H 光标定位
		const r = row + 1;
		const c = col + 1;
		this.terminal.write(`\x1b[${r};${c}H\x1b[?25h`);
	}

	/**
	 * 判断是否需要重绘。v1 采用保守策略：
	 * 只要行数/宽度变化，或任一已有行可见内容不同，就重绘对应部分。
	 * @returns 是否发生任何变化
	 */
	private diff(
		current: string[],
		previous: string[],
		prevW: number,
		prevH: number,
		w: number,
		h: number,
	): boolean {
		if (w !== prevW || h !== prevH) return true;
		if (current.length === 0 && previous.length === 0) return false;
		const n = Math.max(current.length, previous.length);
		for (let i = 0; i < n; i++) {
			if ((current[i] ?? "") !== (previous[i] ?? "")) return true;
		}
		return false;
	}

	override stop(opts?: TuiStopOptions): void {
		super.stop(opts);
	}
}

interface ComponentPart {
	text: string;
	component: unknown;
}
