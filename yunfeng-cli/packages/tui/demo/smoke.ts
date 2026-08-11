/**
 * TUI 冒烟验证：用内存终端驱动与 demo 等价的组装与交互，不依赖真实终端。
 * 运行：npm run smoke
 * 退出码：0 全部通过，1 有失败项。
 */
import { TuiMainScreen } from '../src/tui-main-screen.js';
import type { Terminal } from '../src/tui.js';
import { VStack } from '../src/layout/v-stack.js';
import { Editor } from '../src/components/editor.js';
import { Messages } from '../src/components/messages.js';
import { StatusBar } from '../src/components/status.js';
import { Mascot } from '../src/components/mascot.js';
import { Selector } from '../src/components/selector.js';
import { Overlay } from '../src/components/overlay.js';
import { stripTerminalSequences } from '../src/utils.js';

class MemoryTerminal implements Terminal {
	output = '';
	cols = 80;
	rows = 24;
	private inputHandler: ((d: string) => void) | null = null;

	start(onInput: (d: string) => void): void {
		this.inputHandler = onInput;
	}
	stop(): void {
		this.inputHandler = null;
	}
	write(data: string): void {
		this.output += data;
	}
	get columns(): number {
		return this.cols;
	}
	get rows(): number {
		return this.rows;
	}
	hideCursor(): void {
		this.output += '\x1b[?25l';
	}
	showCursor(): void {
		this.output += '\x1b[?25h';
	}
	clearScreen(): void {
		this.output += '\x1b[2J\x1b[H';
	}
	emit(data: string): void {
		this.inputHandler?.(data);
	}
}

const checks: Array<[string, boolean]> = [];
function check(name: string, ok: boolean): void {
	checks.push([name, ok]);
}

const term = new MemoryTerminal();
const messages = new Messages([{ role: 'system', from: 'yunfeng', content: '欢迎使用 yunfeng-cli TUI' }]);
const editor = new Editor('');
const status = new StatusBar(() => ({ cwd: process.cwd(), sessionName: 'smoke' }));
const mascot = new Mascot({ animate: true, intervalMs: 100000, onFrame: () => tui.requestRender() });

const tui = new TuiMainScreen({ terminal: term });
const layout = new VStack([
	{ component: mascot },
	{ component: messages, grow: 1 },
	{ component: editor },
	{ component: status },
]);
tui.addChild(layout);
tui.setFocus(editor);

let quitFired = false;
tui.addGlobalShortcut('quit', (key) => {
	if (key.kind === 'ctrl' && key.value === 'c') {
		quitFired = true;
		return true;
	}
	return false;
});

// 与 demo 等价的提交逻辑：回车把输入写入消息流
tui.addInputListener((data) => {
	if (data === '\r' || data === '\n') {
		const line = editor.value.trim();
		if (line) {
			messages.add({ role: 'user', from: 'you', content: line });
			editor.value = '';
			editor.cursor = 0;
			tui.requestRender();
		}
	}
	return { consume: false };
});

tui.start();
tui.renderNow(true);

// 1. 首帧内容
const first = stripTerminalSequences(term.output);
check('云朵吉祥物渲染', first.includes('█') && first.includes('●'));
check('欢迎消息渲染', first.includes('欢迎使用 yunfeng-cli'));
check('状态栏展示 cwd', first.includes(process.cwd()));
check('编辑器提示渲染', first.includes('❯'));

// 2. 输入与提交
term.output = '';
for (const ch of 'hello') term.emit(ch);
tui.renderNow(true);
check('输入实时渲染', stripTerminalSequences(term.output).includes('hello'));
term.emit('\r');
tui.renderNow(true);
check(
	'回车写入消息流',
	messages.items.some((m) => m.content === 'hello'),
);
// 提交逻辑 consume:false，回车同时进入编辑器（多行输入）；断言输入内容已清空即可
check('提交后输入内容清空', !editor.value.includes('hello'));

// 3. 全局快捷键
term.emit('\x03');
check('Ctrl+C 全局快捷键触发', quitFired);

// 4. 弹层
const sel = new Selector([{ value: 'a', label: 'A' }]);
tui.openOverlay(new Overlay({ title: '选择', content: sel, width: 20 }), sel);
tui.renderNow(true);
const overlayText = stripTerminalSequences(term.output);
check('弹层渲染标题', overlayText.includes('选择'));
check('弹层覆盖下层', !overlayText.includes('欢迎使用 yunfeng-cli'));

mascot.stop();
tui.stop();

let failed = 0;
for (const [name, ok] of checks) {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
	if (!ok) failed++;
}
if (failed > 0) {
	console.error(`smoke: ${failed}/${checks.length} 项失败`);
	process.exit(1);
}
console.log(`smoke: ${checks.length}/${checks.length} 项全部通过`);
