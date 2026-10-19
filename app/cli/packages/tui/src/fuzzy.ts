/**
 * fuzzy：轻量模糊匹配与过滤（参考 pi 的 fuzzy 方案）。
 *
 * 匹配规则：query 字符需按顺序出现在 target 中（子序列匹配）。
 * 评分偏好：词首命中、连续命中、位置靠前、大小写精确。
 * 用于会话/模型搜索、SelectList 过滤等场景。
 */

export interface FuzzyMatch {
	target: string;
	/** 匹配分数，越高越优 */
	score: number;
	/** 命中的字符索引 */
	indexes: number[];
}

/** 词首字符：空白、连字符、下划线、斜杠、点 */
function isWordStart(target: string, i: number): boolean {
	if (i === 0) return true;
	return /[\s\-_/.]/.test(target[i - 1] ?? '');
}

/** 匹配单个 target；不匹配返回 null */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
	if (query === '') return { target, score: 0, indexes: [] };
	const q = query.toLowerCase();
	const t = target.toLowerCase();
	let qi = 0;
	let consecutive = 0;
	let score = 0;
	const indexes: number[] = [];
	for (let i = 0; i < t.length && qi < q.length; i++) {
		if (t[i] !== q[qi]) {
			consecutive = 0;
			continue;
		}
		indexes.push(i);
		if (isWordStart(target, i)) score += 8;
		if (consecutive > 0) score += 5;
		score += Math.max(0, 10 - i * 0.5); // 位置越靠前越好
		if (target[i] === query[qi]) score += 2; // 大小写精确
		consecutive++;
		qi++;
	}
	if (qi < q.length) return null;
	return { target, score, indexes };
}

/** 过滤并按分数排序；query 为空返回原顺序 */
export function fuzzyFilter<T>(query: string, items: T[], getText: (item: T) => string): T[] {
	if (!query) return items;
	const scored: Array<{ item: T; match: FuzzyMatch }> = [];
	for (const item of items) {
		const m = fuzzyMatch(query, getText(item));
		if (m) scored.push({ item, match: m });
	}
	scored.sort((a, b) => b.match.score - a.match.score);
	return scored.map((x) => x.item);
}
