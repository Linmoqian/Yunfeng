/**
 * CLI 斜杠命令：/help /clear /model /theme /quit。
 *
 * 命令只声明行为契约，不依赖 TUI 实现；实际动作由 app.ts 注入的
 * CommandServices 提供，便于用内存终端测试。接入 agent 后可扩展
 * /resume、/tasks 等真实工作流命令。
 */
export interface CommandServices {
	clearMessages(): void;
	showHelp(): void;
	chooseModel(): void;
	/** 不带参数时打开主题选择器；带 light/dark 时立即切换 */
	chooseTheme(argument?: string): void;
	quit(): void;
}

export interface CommandSpec {
	name: string;
	description: string;
}

export const COMMAND_SPECS: CommandSpec[] = [
	{ name: 'help', description: '显示帮助' },
	{ name: 'clear', description: '清空消息流' },
	{ name: 'model', description: '选择模型' },
	{ name: 'theme', description: '切换明暗主题' },
	{ name: 'quit', description: '退出' },
];

/** 解析 /command，返回小写命令名与剩余参数 */
export function parseCommand(input: string): { name: string; argument: string } {
	const body = input.trim().slice(1);
	const space = body.search(/\s/);
	if (space === -1) return { name: body.toLowerCase(), argument: '' };
	return { name: body.slice(0, space).toLowerCase(), argument: body.slice(space + 1).trim() };
}

/** 执行斜杠命令；返回 true 表示已识别（未知命令由调用方提示） */
export function runCommand(input: string, services: CommandServices): boolean {
	const { name, argument } = parseCommand(input);
	switch (name) {
		case 'help':
			services.showHelp();
			return true;
		case 'clear':
			services.clearMessages();
			return true;
		case 'model':
			services.chooseModel();
			return true;
		case 'theme':
			services.chooseTheme(argument);
			return true;
		case 'quit':
			services.quit();
			return true;
		default:
			return false;
	}
}

export const HELP_TEXT = `# Yunfeng TUI

在底部输入框输入消息，回车发送。当前为交互底座，接入 agent 后由真实事件流驱动。

## 命令
- \`/help\` 显示本帮助
- \`/clear\` 清空当前消息流
- \`/model\` 选择模型（占位目录）
- \`/theme light\` 或 \`/theme dark\` 切换明暗主题
- \`/quit\` 退出

## 按键
- \`Ctrl+C\` 退出
- \`Ctrl+L\` 清屏
- \`Tab\` 接受补全
- \`↑/↓\` 浏览历史消息或补全项`;
