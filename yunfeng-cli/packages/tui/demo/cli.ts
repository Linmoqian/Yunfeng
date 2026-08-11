/**
 * TUI 手工演示入口。
 * 运行：npm run demo
 * 用 VStack 组装 messages + editor + status，展示布局与基本按键交互。
 */
import { TuiMainScreen } from "../src/tui-main-screen.js";
import { ProcessTerminal } from "../src/terminal/process-terminal.js";
import { VStack } from "../src/layout/v-stack.js";
import { Editor } from "../src/components/editor.js";
import { Messages } from "../src/components/messages.js";
import { StatusBar } from "../src/components/status.js";
import { Mascot } from "../src/components/mascot.js";

const messages = new Messages([
	{ role: "system", from: "yunfeng", content: "欢迎使用 yunfeng-cli TUI（VStack 布局）" },
	{ role: "assistant", from: "assistant", content: "在底部输入框打字，↑/↓ 试验。\n输入 quit 退出。" },
]);

const editor = new Editor("");
const status = new StatusBar(() => ({
	cwd: process.cwd(),
	sessionName: "demo",
}));

// 吉祥物：白云，浮动动画（500ms 一帧）
const mascot = new Mascot({
	animate: true,
	intervalMs: 500,
	onFrame: () => tui.requestRender(),
});

const tui = new TuiMainScreen({
	terminal: new ProcessTerminal(),
	showHardwareCursor: true,
});

// VStack 布局：mascot(吉祥物) + messages(可伸缩) + editor + status
const layout = new VStack(
	[
		{ component: mascot },
		{ component: messages, grow: 1 },
		{ component: editor },
		{ component: status },
	],
	{ gap: 0 },
);
tui.addChild(layout);
tui.setFocus(editor);

// 全局快捷键：Ctrl+C 退出、Ctrl+L 清屏
tui.addGlobalShortcut("quit", (key) => {
	if (key.kind === "ctrl" && key.value === "c") {
		process.stdout.write("\x1b[?25h\x1b[0m\n");
		process.exit(0);
	}
	return false;
});
const unsubClear = tui.addGlobalShortcut("clear", (key) => {
	if (key.kind === "ctrl" && key.value === "l") {
		process.stdout.write("\x1b[2J\x1b[H");
		tui.requestRender();
		return true;
	}
	return false;
});

tui.start();

// 监听编辑提交：输入 quit 退出
const unsub = tui.addInputListener((data) => {
	if (data === "\r" || data === "\n") {
		const line = editor.value.trim();
		if (line === "quit" || line === "exit") {
			unsub();
			tui.stop();
			process.stdout.write("\x1b[?25h\x1b[0m\n");
			process.exit(0);
		}
		if (line) {
			messages.add({ role: "user", from: "you", content: line });
			messages.add({ role: "assistant", from: "assistant", content: `收到：${line}` });
			editor.value = "";
			editor.cursor = 0;
			tui.requestRender();
		}
	}
	return { consume: false };
});

process.on("exit", () => {
	process.stdout.write("\x1b[?25h\x1b[0m\n");
});
