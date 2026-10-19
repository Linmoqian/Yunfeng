/**
 * Stack 基类：VStack/HStack 的公共实现。
 * 持有子组件与 flex 约束，渲染时沿主轴分配空间。
 *
 * v1 语义：
 * - basis = 主轴方向计划的节数（vstack 为行数，hstack 为可见列数）
 * - grow/shrink/minSize/maxSize 控制多余/不足空间的分配
 * - vstack 的可用高度由 render 的 height 参数传入（主屏渲染时携带）
 * - align 控制交叉轴对齐：stretch/start/center/end
 */
import {
	LAYOUT_NODE,
	allocateStackSizes,
	toEntry,
	visibleStackEntries,
	type StackEntry,
	type StackLayoutNode,
	type LayoutViewport,
} from './layout-node.js';
import { Container, type Component } from '../tui.js';
import { visibleWidth } from '../utils.js';

export interface StackEntryOptions {
	basis?: number | 'auto';
	grow?: number;
	shrink?: number;
	minSize?: number;
	maxSize?: number;
	visible?: (viewport: LayoutViewport) => boolean;
}

export type StackChild = Component | StackEntry;

export interface StackOptions {
	gap?: number;
	align?: 'stretch' | 'start' | 'center' | 'end';
}

export abstract class Stack extends Container {
	protected entries: StackEntry[] = [];
	protected gap: number;
	protected align: 'stretch' | 'start' | 'center' | 'end';
	protected abstract readonly layoutKind: 'vstack' | 'hstack';

	constructor(children: StackChild[] = [], options: StackOptions = {}) {
		super();
		this.gap = options.gap ?? 0;
		this.align = options.align ?? 'stretch';
		for (const child of children) {
			this.addChild(child);
		}
	}

	override addChild(child: Component | StackEntry, opts?: StackEntryOptions): void {
		const e = toEntry(child);
		const entry: StackEntry = {
			component: e.component,
			basis: opts?.basis ?? e.basis,
			grow: opts?.grow ?? e.grow,
			shrink: opts?.shrink ?? e.shrink,
			minSize: opts?.minSize ?? e.minSize,
			maxSize: opts?.maxSize ?? e.maxSize,
			visible: opts?.visible ?? e.visible,
		};
		this.entries.push(entry);
		this.children.push(entry.component);
		this.invalidate();
	}

	override removeChild(component: Component): void {
		this.entries = this.entries.filter((e) => e.component !== component);
		this.children = this.children.filter((c) => c !== component);
		this.invalidate();
	}

	override clear(): void {
		this.entries = [];
		this.children = [];
		this.invalidate();
	}

	[LAYOUT_NODE](): StackLayoutNode {
		return {
			type: this.layoutKind,
			entries: this.entries,
			gap: this.gap,
			align: this.align,
		};
	}

	/** 子组件沿主轴方向的固有尺寸 */
	protected intrinsicExtent(e: StackEntry, width: number): number {
		const rows = e.component.render(width);
		if (this.layoutKind === 'vstack') return rows.length;
		return Math.max(1, visibleWidth(rows.join('\n')));
	}

	override render(width: number, height?: number): string[] {
		const viewport: LayoutViewport = { width, height: height ?? 0 };
		const visible = visibleStackEntries(this.entries, viewport);
		if (visible.length === 0) return [];

		const basisValues = visible.map((e) =>
			e.basis === undefined || e.basis === 'auto' ? this.intrinsicExtent(e, width) : e.basis,
		);
		// 主轴可用长度：vstack 用 height，hstack 用 width；未提供时保持固有尺寸
		const available = this.layoutKind === 'vstack' ? height : width;
		const sizes = allocateStackSizes(visible, basisValues, available, this.gap);

		if (this.layoutKind === 'vstack') return this.renderVStack(visible, sizes, width, height ?? Infinity);
		return this.renderHStack(visible, sizes, width);
	}

	private renderVStack(visible: StackEntry[], sizes: number[], width: number, totalHeight: number): string[] {
		const lines: string[] = [];
		for (let i = 0; i < visible.length; i++) {
			const e = visible[i]!;
			const size = sizes[i]!;
			// 把分配到的行数传给子组件（如 Messages 可据此决定渲染多少条）
			const rows = e.component.render(width, size);
			// 裁剪或填充到分配行数
			if (rows.length > size) {
				lines.push(...rows.slice(0, size));
			} else {
				lines.push(...rows);
				for (let g = 0; g < size - rows.length; g++) lines.push('');
			}
			if (i < visible.length - 1) {
				for (let g = 0; g < this.gap; g++) lines.push('');
			}
		}
		// 对齐到总可用高度（stretch 语义：撑满）；仅在有限高度时补行
		if (Number.isFinite(totalHeight) && lines.length < totalHeight) {
			const deficit = totalHeight - lines.length;
			for (let g = 0; g < deficit; g++) lines.push('');
		}
		return lines;
	}

	private renderHStack(visible: StackEntry[], sizes: number[], _width: number): string[] {
		const cols: string[][] = visible.map((e, i) => {
			const colWidth = Math.max(1, sizes[i]!);
			return e.component.render(colWidth);
		});
		const maxRows = Math.max(...cols.map((c) => c.length), 0);
		const out: string[] = [];
		for (let r = 0; r < maxRows; r++) {
			let line = '';
			for (let c = 0; c < cols.length; c++) {
				const col = cols[c]!;
				// 交叉轴（垂直）对齐
				const row = this.alignRow(col, r, maxRows) ?? '';
				line += row + (c < cols.length - 1 ? ' '.repeat(this.gap) : '');
			}
			out.push(line);
		}
		return out;
	}

	/** 取列的第 r 行；按 align 在垂直方向对齐（stretch 顶部对齐补空） */
	private alignRow(col: string[], r: number, maxRows: number): string | null {
		const len = col.length;
		if (this.align === 'end') {
			const startRow = maxRows - len;
			return r < startRow ? '' : (col[r - startRow] ?? '');
		}
		if (this.align === 'center') {
			const startRow = Math.floor((maxRows - len) / 2);
			return r < startRow ? '' : (col[r - startRow] ?? '');
		}
		// stretch / start：顶部对齐
		return col[r] ?? '';
	}
}
