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

	override stop(opts?: TuiStopOptions): void {
		super.stop(opts);
	}
}

interface ComponentPart {
	text: string;
	component: unknown;
}
