/**
 * 布局树节点描述（flexbox 式）与空间分配算法。
 *
 * 参照 pi 的 layout-node 抽象：布局由 VStack/HStack/Scroll 三类节点组成，
 * 每个 StackEntry 可带 basis/grow/shrink/minSize/maxSize/visible 约束，
 * 遵循 flexbox 的分配语义。视觉组件用 LAYOUT_NODE 暴露自身的布局描述。
 */
import type { Component } from '../tui.js';

/** 布局树的标准符号 */
export const LAYOUT_NODE: unique symbol = Symbol('LAYOUT_NODE');

export interface LayoutViewport {
	width: number;
	height: number;
}

export interface StackEntry {
	component: Component;
	/** 主轴初始尺寸；"auto" 表示按内容固有尺寸 */
	basis?: number | 'auto';
	grow?: number;
	shrink?: number;
	minSize?: number;
	maxSize?: number;
	visible?: (viewport: LayoutViewport) => boolean;
}

export type StackLayoutNode = {
	type: 'vstack' | 'hstack';
	entries: readonly (StackEntry | Component)[];
	gap: number;
	align: 'stretch' | 'start' | 'center' | 'end';
};

/** 滚动节点（v1 暂最小实现，后续补全） */
export type ScrollLayoutNode = {
	type: 'scroll';
	component: Component;
};

export type LayoutNode = StackLayoutNode | ScrollLayoutNode;

/** 可暴露布局描述给布局系统优化的组件接口 */
export interface LayoutComponent extends Component {
	[LAYOUT_NODE](): LayoutNode;
}

export function isLayoutComponent(c: Component): c is LayoutComponent {
	return LAYOUT_NODE in c && typeof c[LAYOUT_NODE] === 'function';
}

/** 归一化 children：允许直接传 Component 或可带约束的 StackEntry */
export function toEntry(child: Component | StackEntry): StackEntry {
	if ('component' in child && child.component && typeof child.component === 'object') {
		return child as StackEntry;
	}
	return { component: child as Component };
}

/** 计算未知尺寸条目的固有尺寸（由组件决定，默认为其基本渲染尺寸） */
export function intrinsicSizeOf(_entry: Component, _width: number): number {
	return 0;
}

/**
 * flexbox 式空间分配（沿主轴）。
 * 先按 basis（或固有尺寸）放置，再按 grow 平分多余空间、按 shrink 收回超了空间。
 *
 * @param entries 条目列表
 * @param intrinsic 每个条目的固有尺寸
 * @param available 可用主轴总长；undefined 表示以固有尺寸为准
 * @param gap 条目间距
 * @returns 每个条目分配到的尺寸
 */
export function allocateStackSizes(
	entries: readonly StackEntry[],
	intrinsic: readonly number[],
	available: number | undefined,
	gap: number,
): number[] {
	const n = entries.length;
	if (n === 0) return [];
	const base: number[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const e = entries[i]!;
		let size = e.basis === undefined || e.basis === 'auto' ? intrinsic[i]! : e.basis;
		if (e.minSize !== undefined) size = Math.max(size, e.minSize);
		if (e.maxSize !== undefined) size = Math.min(size, e.maxSize);
		base[i] = size;
	}
	if (available === undefined) {
		return base.map((v, i) => applyMinMax(v, entries[i]!));
	}
	const gaps = Math.max(0, n - 1) * gap;
	const free = available - gaps - base.reduce((a, b) => a + b, 0);

	// grow：平分多余空间
	if (free > 0) {
		const growTotal = entries.reduce((a, e) => a + (e.grow ?? 0), 0);
		if (growTotal > 0) {
			let remaining = free;
			for (let i = 0; i < n; i++) {
				const e = entries[i]!;
				const grow = e.grow ?? 0;
				if (grow > 0) {
					const add = Math.floor((free * grow) / growTotal);
					base[i]! += add;
					remaining -= add;
				}
			}
			// 处理除不尽余量，给最后一个可增长项
			if (remaining > 0) {
				for (let i = n - 1; i >= 0; i--) {
					if ((entries[i]!.grow ?? 0) > 0) {
						base[i]! += remaining;
						break;
					}
				}
			}
		}
	}

	// shrink：空间不足时按 shrink 比例收缩
	if (free < 0) {
		const shrinkTotal = entries.reduce((a, e) => a + (e.shrink ?? 0), 0);
		const deficit = -free;
		if (shrinkTotal > 0) {
			let remaining = deficit;
			for (let i = 0; i < n; i++) {
				const e = entries[i]!;
				const shrink = e.shrink ?? 0;
				if (shrink > 0) {
					const cut = Math.floor((deficit * shrink) / shrinkTotal);
					base[i]! -= cut;
					remaining -= cut;
				}
			}
			if (remaining > 0) {
				for (let i = n - 1; i >= 0; i--) {
					if ((entries[i]!.shrink ?? 0) > 0) {
						base[i]! -= remaining;
						break;
					}
				}
			}
		}
	}

	return base.map((v, i) => applyMinMax(v, entries[i]!));
}

function applyMinMax(v: number, e: StackEntry): number {
	let out = v;
	if (e.maxSize !== undefined) out = Math.min(out, e.maxSize);
	if (e.minSize !== undefined) out = Math.max(out, e.minSize);
	return Math.max(0, out);
}

/** 过滤当前 viewport 下不可见的条目 */
export function visibleStackEntries(entries: readonly StackEntry[], viewport: LayoutViewport): StackEntry[] {
	return entries.filter((e) => !e.visible || e.visible(viewport));
}
