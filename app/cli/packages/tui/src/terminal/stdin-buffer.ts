/**
 * StdinBuffer：将终端流式输入按完整按键/序列粒度切分输出。
 *
 * 终端 data 事件可能分批到达，尤其转义序列（如方向键 \x1b[A）可能被拆成多次：
 * - Event 1: \x1b
 * - Event 2: [A
 *
 * 本缓冲累积这些片段直到形成完整序列；单个 ESC 因与序列前缀/Alt 组合存在歧义，
 * 会缓冲 escTimeoutMs 后按 escape 输出（标准终端行为，轻微延迟可接受）。
 *
 * 参考 pi 的 stdin-buffer 方案，按 yunfeng-cli 需求简化（不含鼠标/OSC/DCS 细分）。
 */
import { parseKey, type Key } from './input.js';

const ESC = '\x1b';

export class StdinBuffer {
	private buffer = '';
	private escTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly escTimeoutMs = 80) {}

	/** 追加输入，对每个完整按键调用 emit(chunk, key) */
	feed(data: string, emit: (chunk: string, key: Key) => void): void {
		this.buffer += data;
		this.drain(emit);
	}

	private drain(emit: (chunk: string, key: Key) => void): void {
		let buf = this.buffer;
		this.buffer = '';
		while (buf.length > 0) {
			const parsed = parseKey(buf);
			if (parsed) {
				this.cancelEscTimeout();
				const chunk = buf.slice(0, parsed.consumed);
				buf = buf.slice(parsed.consumed);
				emit(chunk, parsed.key);
				continue;
			}
			// 以 ESC 开头：可能是未完成序列，保留缓冲等更多数据
			if (buf.startsWith(ESC)) {
				this.buffer = buf;
				if (buf.length === 1) this.armEscTimeout(emit);
				return;
			}
			// 无法解析的单字节：按原样输出
			const chunk = buf.slice(0, 1);
			buf = buf.slice(1);
			emit(chunk, { kind: 'unknown', raw: chunk });
		}
	}

	private armEscTimeout(emit: (chunk: string, key: Key) => void): void {
		if (this.escTimer) return;
		this.escTimer = setTimeout(() => {
			this.escTimer = null;
			// 超时后若仍是孤立 ESC，按 escape 键输出
			if (this.buffer === ESC) {
				this.buffer = '';
				emit(ESC, { kind: 'escape' });
			}
		}, this.escTimeoutMs);
	}

	private cancelEscTimeout(): void {
		if (this.escTimer) {
			clearTimeout(this.escTimer);
			this.escTimer = null;
		}
	}

	/** 清空缓冲与定时器（TUI stop 时调用） */
	clear(): void {
		this.buffer = '';
		this.cancelEscTimeout();
	}
}
