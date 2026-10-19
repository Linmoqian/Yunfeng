#!/usr/bin/env node
/**
 * @yunfeng/cli 入口：启动 Yunfeng TUI 主界面。
 * 应用组装在 app.ts；本文件只负责包级导出与直接运行判定。
 */
import { main } from './app.js';

export { createApp, main, type CliApp, type CliScreenMode, type CliTui, type CreateAppOptions } from './app.js';
export { COMMAND_SPECS, HELP_TEXT, parseCommand, runCommand, type CommandServices } from './commands.js';

// 直接运行（bin / node dist/index.js）时启动；被 import 时不启动
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
	main();
}
