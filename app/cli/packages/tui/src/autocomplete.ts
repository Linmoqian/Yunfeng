/**
 * autocomplete：自动补全 Provider（模仿 pi 的 autocomplete 方案）。
 *
 * - AutocompleteProvider：输入 -> 建议列表（同步或 Promise）
 * - CommandProvider：斜杠命令补全（输入以 / 开头时）
 * - FileProvider：当前目录文件/目录名补全
 * - CombinedAutocompleteProvider：按顺序取第一个有建议的 provider
 */
import { readdirSync } from 'node:fs';

export interface Suggestion {
	label: string;
	description?: string;
}

export interface AutocompleteProvider {
	/** 返回与输入匹配的建议（同步；异步扩展留待后续） */
	getSuggestions(input: string): Suggestion[];
}

export interface CommandSpec {
	name: string;
	description?: string;
}

/** 斜杠命令补全：/cmd 前缀匹配 */
export class CommandProvider implements AutocompleteProvider {
	constructor(private commands: CommandSpec[]) {}

	getSuggestions(input: string): Suggestion[] {
		if (!input.startsWith('/')) return [];
		const q = input.slice(1).toLowerCase();
		return this.commands
			.filter((c) => c.name.toLowerCase().startsWith(q))
			.map((c) => ({ label: `/${c.name}`, description: c.description }));
	}
}

/** 文件/目录名补全：cwd 下前缀匹配（一级，不递归） */
export class FileProvider implements AutocompleteProvider {
	constructor(private cwd: string) {}

	getSuggestions(input: string): Suggestion[] {
		if (input.startsWith('/') || input === '') return [];
		try {
			return readdirSync(this.cwd, { withFileTypes: true })
				.filter((e) => e.name.toLowerCase().startsWith(input.toLowerCase()))
				.map((e) => ({ label: e.name + (e.isDirectory() ? '/' : '') }));
		} catch {
			return [];
		}
	}
}

/** 组合 Provider：依次尝试，返回第一个非空建议集 */
export class CombinedAutocompleteProvider implements AutocompleteProvider {
	constructor(private providers: AutocompleteProvider[]) {}

	getSuggestions(input: string): Suggestion[] {
		for (const p of this.providers) {
			const s = p.getSuggestions(input);
			if (s.length > 0) return s;
		}
		return [];
	}
}
