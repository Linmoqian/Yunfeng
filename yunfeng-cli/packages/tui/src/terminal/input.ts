/**
 * 终端原始输入解析：把 stdout 的字节流解析成结构化按键事件。
 *
 * 终端在 raw mode 下逐字符（或转义序列）发送输入。这里负责：
 * - 常规可打印字符 -> { kind: 'char', value }
 * - 转义序列 -> 功能键（方向键、Enter、Backspace 等）
 *
 * v1 覆盖常用子集（方向键、退格、回车、Tab、Esc、功能键）。
 * 复杂协议（Kitty keyboard、IME 组合）留待后续版本，见 docs 待补条目。
 * 解析器为无状态纯函数，便于单测。
 */

export type Key =
	| { kind: 'char'; value: string }
	| { kind: 'enter' }
	| { kind: 'backspace' }
	| { kind: 'tab' }
	| { kind: 'escape' }
	| { kind: 'arrow'; direction: 'up' | 'down' | 'left' | 'right'; ctrl?: boolean; alt?: boolean; shift?: boolean }
	| { kind: 'home' }
	| { kind: 'end' }
	| { kind: 'delete' }
	| { kind: 'pageup' }
	| { kind: 'pagedown' }
	| { kind: 'function'; index: number; ctrl?: boolean; alt?: boolean; shift?: boolean }
	| { kind: 'alt'; value: string }
	| { kind: 'ctrl'; value: string }
	| { kind: 'unknown'; raw: string };

export interface ParseResult {
	key: Key;
	/** 该按键消耗的原始字节数（byte 级别步进用） */
	consumed: number;
}

/** 普通可见字符的 ASCII 区间 */
function isPrintable(ch: number): boolean {
	return ch >= 0x20 && ch <= 0x7e;
}

/** 解析单个字节为最简按键 */
function parseByte(b: number): Key | null {
	if (isPrintable(b)) {
		return { kind: 'char', value: String.fromCharCode(b) };
	}
	if (b === 0x0a || b === 0x0d) {
		return { kind: 'enter' };
	}
	if (b === 0x08 || b === 0x7f) {
		return { kind: 'backspace' };
	}
	if (b === 0x09) {
		return { kind: 'tab' };
	}
	if (b === 0x1b) {
		return { kind: 'escape' };
	}
	// 控制字符（如 Ctrl+C = 0x03, Ctrl+D = 0x04）映射到 ctrl
	if (b >= 0x01 && b <= 0x1a) {
		return { kind: 'ctrl', value: String.fromCharCode(b + 0x60) };
	}
	return null;
}

/** 修饰码（xterm）：2=shift, 3=alt, 4=shift+alt, 5=ctrl, 6=ctrl+shift, 7=ctrl+alt, 8=ctrl+alt+shift */
function modifiersFromCode(code: number | undefined): { ctrl?: boolean; alt?: boolean; shift?: boolean } {
	const c = code ?? 1;
	const mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {};
	if (c >= 5 && c <= 8) mods.ctrl = true;
	if (c === 3 || c === 4 || c === 7 || c === 8) mods.alt = true;
	if (c === 2 || c === 4 || c === 6 || c === 8) mods.shift = true;
	return mods;
}

/** 从 CSI 参数中提取修饰码（仅当含分号时取最后一段，如 "1;5" -> 5；"15" -> undefined） */
function modifierCodeFromParam(param: string): number | undefined {
	if (!param.includes(';')) return undefined;
	const parts = param.split(';');
	const last = parts[parts.length - 1];
	const n = Number(last);
	return Number.isInteger(n) ? n : undefined;
}

/** CSI 序列解析返回的跳转映射 */
const CSI_TABLE: Record<string, (pfx: string) => Key> = {
	A: (pfx) => ({ kind: 'arrow', direction: 'up', ...modifiersFromCode(modifierCodeFromParam(pfx)) }),
	B: (pfx) => ({ kind: 'arrow', direction: 'down', ...modifiersFromCode(modifierCodeFromParam(pfx)) }),
	C: (pfx) => ({ kind: 'arrow', direction: 'right', ...modifiersFromCode(modifierCodeFromParam(pfx)) }),
	D: (pfx) => ({ kind: 'arrow', direction: 'left', ...modifiersFromCode(modifierCodeFromParam(pfx)) }),
	H: (_pfx) => ({ kind: 'home' }),
	F: (_pfx) => ({ kind: 'end' }),
};

/** CSI ~ 的 F 键码（15= F5，17-21=F6-F10，23/24=F11/F12） */
const CSI_FUNCTION_TABLE: Record<number, number> = {
	15: 5,
	17: 6,
	18: 7,
	19: 8,
	20: 9,
	21: 10,
	23: 11,
	24: 12,
};

/** CSI ~ 序列（如 [3~ Delete、[1~ Home、[4~ End） */
const CSI_TILDE_TABLE: Record<string, Key> = {
	'1': { kind: 'home' },
	'3': { kind: 'delete' },
	'4': { kind: 'end' },
	'5': { kind: 'pageup' },
	'6': { kind: 'pagedown' },
};

/**
 * 尝试解析一个完整事件（可能跨多字节）。
 * 该方法要求 buffer 已包含足够字节；若返回 null 表示需要等待更多字节。
 *
 * @param data 累积的输入缓冲（string，按 charCode 逐个消费）
 * @param pos  解析起点
 */
export function parseKey(data: string, pos = 0): ParseResult | null {
	const ch0 = data.charCodeAt(pos);
	if (Number.isNaN(ch0)) return null;

	// ESC 前缀：可能是独立 ESC 或转义序列
	if (ch0 === 0x1b) {
		const ch1 = data.charCodeAt(pos + 1);
		// 独立 ESC
		if (data.length < pos + 2) return null;
		if (ch1 === 0x1b) {
			// 连续两次 ESC 视为一次 ESC（简化）
			return { key: { kind: 'escape' }, consumed: 2 };
		}
		if (ch1 === 0x5b) {
			// CSI: ESC [
			if (data.length < pos + 3) return null;
			// 读取参数直至找到 CSI 终止字符
			let j = pos + 2;
			let param = '';
			while (j < data.length) {
				const c = data.charCodeAt(j);
				const isParam = c === 0x3b || (c >= 0x30 && c <= 0x3f);
				if (isParam) {
					param += data[j];
					j++;
				} else {
					break;
				}
			}
			if (j >= data.length) return null;
			const finalChar = data[j];
			if (finalChar === '~') {
				const [codeStr] = param.split(';');
				const tildeKey = CSI_TILDE_TABLE[codeStr ?? ''];
				if (tildeKey) {
					return { key: tildeKey, consumed: j + 1 - pos };
				}
				const fnIndex = CSI_FUNCTION_TABLE[Number(codeStr)];
				if (fnIndex !== undefined) {
					return {
						key: { kind: 'function', index: fnIndex, ...modifiersFromCode(modifierCodeFromParam(param)) },
						consumed: j + 1 - pos,
					};
				}
				return { key: { kind: 'unknown', raw: data.slice(pos, j + 1) }, consumed: j + 1 - pos };
			}
			const handler = finalChar != null ? CSI_TABLE[finalChar] : undefined;
			if (handler) {
				return { key: handler(param), consumed: j + 1 - pos };
			}
			return { key: { kind: 'unknown', raw: data.slice(pos, j + 1) }, consumed: j + 1 - pos };
		}
		// 应用模式 F1-F4：\x1bOP/Q/R/S
		if (ch1 === 0x4f) {
			const fnMap: Record<string, number> = { P: 1, Q: 2, R: 3, S: 4 };
			const ch2 = data[pos + 2];
			const fn = ch2 != null ? fnMap[ch2] : undefined;
			if (fn !== undefined) {
				return { key: { kind: 'function', index: fn }, consumed: 3 };
			}
			return { key: { kind: 'unknown', raw: data.slice(pos, pos + 3) }, consumed: 3 };
		}
		// Alt + 可打印字符：ESC 后跟一个普通字符
		if (ch1 >= 0x20 && ch1 <= 0x7e) {
			return { key: { kind: 'alt', value: data[pos + 1] ?? '' }, consumed: 2 };
		}
		// 其他 ESC 前缀，按 unknown 处理
		return { key: { kind: 'unknown', raw: data.slice(pos, pos + 2) }, consumed: 2 };
	}

	const key = parseByte(ch0);
	return key ? { key, consumed: 1 } : null;
}
