/**
 * 终端渲染原语：处理可见宽度、ANSI 序列剥离、按列字符切片与换行。
 *
 * 只依赖 Node 标准库 Intl.Segmenter，无第三方依赖。
 * 这些函数是 TUI 布局与光标定位的地基，需覆盖 CJK 宽字符与 ANSI 样式保持。
 *
 * 契约：
 * - 所有"可见宽度"均指终端列数（ASCII=1，CJK 宽字符=2）
 * - ANSI 序列（\x1b[...m 及 OSC/APC）不计入可见宽度
 */
import { style, RESET } from './terminal/ansi.js';

let graphemeSegmenter: Intl.Segmenter | null = null;
function getGraphemeSegmenter(): Intl.Segmenter {
	if (!graphemeSegmenter) {
		graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	}
	return graphemeSegmenter;
}

/** 剥离 ANSI/OSC/APC 转义序列，仅保留可见文本。返回第 i 个字符处的序列描述 */
function extractAnsiCode(str: string, pos: number): { code: string; length: number } | null {
	if (str[pos] !== '\x1b') return null;
	// CSI: ESC [  参数] 中间字节 0x30-0x3F  终止 0x40-0x7E
	let i = pos + 1;
	if (str[i] === '[') {
		i++;
		while (i < str.length) {
			const c = str.charCodeAt(i);
			if (c >= 0x40 && c <= 0x7e) return { code: str.slice(pos, i + 1), length: i + 1 - pos };
			i++;
		}
		return null;
	}
	// OSC/APC: ESC ] / ESC _
	if (str[i] === ']' || str[i] === '_') {
		const terminator = str[i] === ']' ? '\x07' : '\x1b\\';
		const idx = str.indexOf(terminator, i);
		if (idx === -1) return null;
		return { code: str.slice(pos, idx + terminator.length), length: idx + terminator.length - pos };
	}
	return null;
}

/**
 * 字素是否为 emoji 展示形态（终端通常占 2 列）：
 * Emoji_Presentation 覆盖彩色 emoji；VS16/组合键帽单独处理。
 */
function isEmojiPresentation(segment: string): boolean {
	return (
		/\p{Emoji_Presentation}/u.test(segment) ||
		(segment.length >= 2 && /[\u{1f1e6}-\u{1f1ff}]{2}/u.test(segment)) ||
		(/\p{Emoji}/u.test(segment) && /[\ufe0f\u20e3]/u.test(segment))
	);
}

/** 单字符可见宽度：CJK/全角=2、emoji 展示形态=2，其余=1 */
function graphemeWidth(segment: string): number {
	if (segment.length === 0) return 0;
	const code = segment.codePointAt(0)!;
	if (
		(code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
		(code >= 0x2e80 && code <= 0xa4cf) || // CJK radical..Yi
		(code >= 0xac00 && code <= 0xd7a3) || // Hangul
		(code >= 0xf900 && code <= 0xfaff) || // CJK compat
		(code >= 0xfe30 && code <= 0xfe4f) || // CJK compat forms
		(code >= 0xff00 && code <= 0xff60) || // Fullwidth forms
		(code >= 0xffe0 && code <= 0xffe6) ||
		(code >= 0x20000 && code <= 0x2fffd) ||
		(code >= 0x30000 && code <= 0x3fffd)
	) {
		return 2;
	}
	if (isEmojiPresentation(segment)) return 2;
	return 1;
}

/** 计算字符串可见宽度（终端列数），剥离 ANSI 并处理宽字符 */
export function visibleWidth(str: string): number {
	if (str.length === 0) return 0;
	const clean = str.replace(/\t/g, '   ');
	let width = 0;
	let i = 0;
	while (i < clean.length) {
		const ansi = extractAnsiCode(clean, i);
		if (ansi) {
			i += ansi.length;
			continue;
		}
		// 逐字素段累加宽度（一个完整字素可能跨多个 byte）
		const g = nextGrapheme(clean.slice(i));
		width += graphemeWidth(g);
		i += g.length;
	}
	return width;
}

/** 剥离 ANSI/OSC/APC 序列，保留可见文本 */
export function stripTerminalSequences(str: string): string {
	if (!str.includes('\x1b')) return str;
	let result = '';
	let i = 0;
	while (i < str.length) {
		const ansi = extractAnsiCode(str, i);
		if (ansi) {
			i += ansi.length;
			continue;
		}
		result += str[i];
		i++;
	}
	return result;
}

function makeTracker(): { active: string; update(code: string): void; reset(): void } {
	return {
		active: '',
		update(code: string): void {
			if (code.startsWith('\x1b[') && code.endsWith('m')) {
				if (code === RESET) {
					this.active = '';
				} else {
					this.active = code;
				}
			}
		},
		reset(): void {
			this.active = '';
		},
	};
}

/**
 * 按单词切分含 ANSI 的行，隔离可测量 token。
 * 简化实现：以空白为界切分，token 保留自带 ANSI。
 */
function splitIntoTokens(line: string): string[] {
	const tokens: string[] = [];
	// 追踪 SGR 状态，识别空白边界时不把序列混入
	let buffer = '';
	let pendingAnsi = '';
	let i = 0;
	const flush = () => {
		if (buffer.length > 0 || pendingAnsi.length > 0) {
			tokens.push(pendingAnsi + buffer);
			buffer = '';
			pendingAnsi = '';
		}
	};
	while (i < line.length) {
		const ansi = extractAnsiCode(line, i);
		if (ansi) {
			pendingAnsi += ansi.code;
			i += ansi.length;
			continue;
		}
		const ch = line[i];
		if (ch === ' ' || ch === '\t') {
			flush();
			tokens.push(ch);
		} else {
			buffer += ch;
		}
		i++;
	}
	flush();
	return tokens;
}

/** 取字符串起始处的一个完整字素 */
function nextGrapheme(str: string): string {
	for (const { segment } of getGraphemeSegmenter().segment(str)) {
		return segment;
	}
	return str;
}

/**
 * 将含 ANSI 的文本按可见宽度折行，跨行保持激活的样式。
 * 只做单词折行，不做填充/背景。
 *
 * @param text 可能含 ANSI 与换行的文本
 * @param width 单行最大可见宽度
 * @returns 折行后的行数组（未填充宽度）
 */
export function wrapTextWithAnsi(text: string, width: number): string[] {
	if (width <= 0) return [''];
	const inputLines = text.split(/\r\n|\r|\n/);
	const result: string[] = [];
	const tracker = makeTracker();
	for (const inputLine of inputLines) {
		const prefix = result.length > 0 ? tracker.active : '';
		const wrapped = wrapSingleLine(prefix + inputLine, width, tracker);
		result.push(...wrapped);
	}
	return result.length > 0 ? result : [''];
}

function wrapSingleLine(
	line: string,
	width: number,
	outTracker: { active: string; update(code: string): void },
): string[] {
	if (!line) return [''];
	if (visibleWidth(line) <= width) {
		// 更新样式状态跟踪
		void outTracker;
		return [line];
	}
	const wrapped: string[] = [];
	const localTracker = makeTracker();
	const tokens = splitIntoTokens(line);
	let currentLine = '';
	let currentWidth = 0;
	for (const token of tokens) {
		const tw = visibleWidth(token);
		const isWhitespace = token.trim() === '';
		if (tw > width && !isWhitespace) {
			// 超长单词：字符级断裂（后续会重新赋值 currentLine/currentWidth）
			if (currentLine) {
				wrapped.push(currentLine.trimEnd());
			}
			let remain = token;
			while (visibleWidth(remain) > width) {
				let cut = 0;
				let acc = 0;
				while (cut < remain.length && acc < width) {
					const ansi = extractAnsiCode(remain, cut);
					if (ansi) {
						cut += ansi.length;
						continue;
					}
					const seg = nextGrapheme(remain.slice(cut));
					acc += graphemeWidth(seg);
					cut += seg.length;
				}
				const seg = remain.slice(0, cut);
				wrapped.push(seg);
				remain = remain.slice(cut);
			}
			currentLine = remain;
			currentWidth = visibleWidth(currentLine);
			continue;
		}
		if (currentWidth + tw > width && currentWidth > 0) {
			wrapped.push(currentLine.trimEnd());
			if (isWhitespace) {
				currentLine = localTracker.active;
				currentWidth = 0;
			} else {
				currentLine = localTracker.active + token;
				currentWidth = tw;
			}
		} else {
			currentLine += token;
			currentWidth += tw;
		}
		updateTracker(token, localTracker);
	}
	if (currentLine) wrapped.push(currentLine.trimEnd());
	return wrapped.length > 0 ? wrapped : [''];
}

function updateTracker(token: string, tracker: { active: string; update(code: string): void }): void {
	let i = 0;
	while (i < token.length) {
		const ansi = extractAnsiCode(token, i);
		if (ansi) {
			tracker.update(ansi.code);
			i += ansi.length;
		} else {
			i++;
		}
	}
}

/**
 * 截断文本到最大可见宽度，超出加省略号。正确处理 ANSI。
 *
 * @param text 可能含 ANSI
 * @param maxWidth 最大可见宽度
 * @param ellipsis 省略号（默认 "..."）
 * @param pad 是否用空格补齐到恰好 maxWidth
 */
export function truncateToWidth(text: string, maxWidth: number, ellipsis = '...', pad = false): string {
	if (text === '') return pad ? ' '.repeat(maxWidth) : '';
	const strippedWidth = visibleWidth(text);
	if (strippedWidth <= maxWidth) return pad ? text + ' '.repeat(maxWidth - strippedWidth) : text;
	const ellipsisWidth = visibleWidth(ellipsis);
	const target = maxWidth - ellipsisWidth;
	let cut = 0;
	let acc = 0;
	while (cut < text.length) {
		const ansi = extractAnsiCode(text, cut);
		if (ansi) {
			cut += ansi.length;
			continue;
		}
		const seg = nextGrapheme(text.slice(cut));
		const w = graphemeWidth(seg);
		if (acc + w > target) break;
		acc += w;
		cut += seg.length;
	}
	let out = text.slice(0, cut) + ellipsis;
	if (pad) out += ' '.repeat(Math.max(0, maxWidth - visibleWidth(out)));
	return out;
}

/**
 * 从一行中取出从 startCol 开始的 length 个可见列（正确处理 ANSI 与宽字符）。
 */
export function sliceByColumn(line: string, startCol: number, length: number): string {
	const result: string[] = [];
	let col = 0;
	let i = 0;
	while (i < line.length && col < startCol + length) {
		const ansi = extractAnsiCode(line, i);
		if (ansi) {
			result.push(ansi.code);
			i += ansi.length;
			continue;
		}
		const seg = nextGrapheme(line.slice(i));
		const w = graphemeWidth(seg);
		if (col + w > startCol && col < startCol + length) {
			result.push(seg);
		}
		col += w;
		i += seg.length;
	}
	return result.join('');
}

/** 给一行施加背景色并填充到指定宽度 */
export function applyBackgroundToLine(line: string, width: number, bgFn: (text: string) => string): string {
	const w = visibleWidth(line);
	void style;
	return bgFn(line + ' '.repeat(Math.max(0, width - w)));
}
