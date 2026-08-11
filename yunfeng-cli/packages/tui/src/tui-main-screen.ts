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

		const output = this.diffAndBuild(lines, this.prevLines, this.prevWidth, this.prevHeight, width, height);
		if (output !== null) {
			this.terminal.write(output);
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

	/**
	 * 逐行差分：对比当前与上一帧，返回需要输出的终端序列。
	 * - 尺寸变化：全量重绘（移到原点逐行清行写）
	 * - 行内容变化：仅对变化行做光标定位 + 清行 + 写入，保留其余区域
	 * - 无变化：返回 null（不输出任何字节）
	 */
	private diffAndBuild(
		current: string[],
		previous: string[],
		prevW: number,
		prevH: number,
		w: number,
		h: number,
	): string | null {
		const full = w !== prevW || h !== prevH;
		const dirty: number[] = [];
		if (full) {
			for (let i = 0; i < Math.min(current.length, h); i++) dirty.push(i);
		} else {
			const n = Math.max(current.length, previous.length);
			for (let i = 0; i < n; i++) {
				if ((current[i] ?? "") !== (previous[i] ?? "")) dirty.push(i);
			}
		}
		if (dirty.length === 0) return null;

		let out = "";
		if (full) out += "\x1b[H";
		for (const row of dirty) {
			if (row >= h) break;
			const line = current[row] ?? "";
			if (full) {
				out += "\x1b[2K" + line + "\x1b[0m\n";
			} else {
				// 定位到目标行（1-based）再清行写入
				out += `\x1b[${row + 1};1H\x1b[2K${line}\x1b[0m`;
			}
		}
		return out;
	}

	private positionCursor(row: number, col: number, height: number): void {
		// \x1b[<row>;<col>H 光标定位
		const r = row + 1;
		const c = col + 1;
		this.terminal.write(`\x1b[${r};${c}H\x1b[?25h`);
	}

	override stop(opts?: TuiStopOptions): void {
		super.stop(opts);
	}
}

interface ComponentPart {
	text: string;
	component: unknown;
}
