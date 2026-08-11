/**
 * TuiFullScreen：渲染进备用屏幕（alt screen）。
 * 进入时切换备用屏并清屏，退出时恢复主屏（可 preserveScreen 留给接管者）。
 * 内容渲染复用 TuiBase 的逐行差分。
 */
import { TuiBase, CURSOR_MARKER, type Terminal, type TuiMode, type TuiStopOptions } from "./tui.js";

export interface TuiFullScreenOptions {
	terminal: Terminal;
	showHardwareCursor?: boolean;
}

export class TuiFullScreen extends TuiBase {
	readonly mode: TuiMode = "fullscreen";
	terminal: Terminal;
	private showHardwareCursor: boolean;

	constructor(opts: TuiFullScreenOptions) {
		super();
		this.terminal = opts.terminal;
		this.showHardwareCursor = opts.showHardwareCursor ?? false;
	}

	override start(): void {
		// 进入备用屏幕 + 清屏 + 隐藏光标
		this.terminal.write("\x1b[?1049h\x1b[2J\x1b[H");
		this.terminal.hideCursor();
		super.start();
	}

	protected doRender(): void {
		const width = this.terminal.columns;
		const height = this.terminal.rows;

		// 装配子组件行（含 CURSOR_MARKER），传入可用高度
		const content: string[] = [];
		this.children.forEach((c) => {
			content.push(...c.render(width, height));
		});
		const visible = content.slice(-height);
		const cursorPos = this.extractCursorPosition(visible, height);
		const lines = visible.map((l) => l.split(CURSOR_MARKER).join(""));

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
		// preserveScreen：留给后续接管同一终端的 TUI，不退出备用屏幕
		if (!opts?.preserveScreen) {
			this.terminal.write("\x1b[?1049l");
		}
		this.terminal.showCursor();
	}
}
