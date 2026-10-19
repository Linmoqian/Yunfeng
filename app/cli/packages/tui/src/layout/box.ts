import { Container } from '../tui.js';
import { applyBackgroundToLine } from '../utils.js';

/**
 * Box：给子组件整体加 padding 与背景色的容器。
 */
export class Box extends Container {
	private paddingX: number;
	private paddingY: number;
	private bgFn?: (text: string) => string;

	constructor(paddingX = 0, paddingY = 0, bgFn?: (text: string) => string) {
		super();
		this.paddingX = paddingX;
		this.paddingY = paddingY;
		this.bgFn = bgFn;
	}

	setBgFn(bgFn?: (text: string) => string): void {
		this.bgFn = bgFn;
		this.invalidate();
	}

	override render(width: number): string[] {
		const innerWidth = Math.max(0, width - this.paddingX * 2);
		const inner = super.render(innerWidth);
		const out: string[] = [];
		for (let i = 0; i < this.paddingY; i++) out.push(this.applyBg(''));
		for (const line of inner) {
			const padded = ' '.repeat(this.paddingX) + line + ' '.repeat(this.paddingX);
			out.push(this.applyBg(padded));
		}
		for (let i = 0; i < this.paddingY; i++) out.push(this.applyBg(''));
		return out;
	}

	private applyBg(line: string): string {
		if (!this.bgFn) return line;
		return applyBackgroundToLine(line, line.length, this.bgFn);
	}
}
