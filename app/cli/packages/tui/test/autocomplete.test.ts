import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandProvider, FileProvider, CombinedAutocompleteProvider } from '../src/autocomplete.js';

describe('CommandProvider', () => {
	it('matches slash commands by prefix', () => {
		const p = new CommandProvider([
			{ name: 'help', description: '帮助' },
			{ name: 'model', description: '选模型' },
		]);
		expect(p.getSuggestions('/he').map((s) => s.label)).toEqual(['/help']);
		expect(p.getSuggestions('/m').map((s) => s.label)).toEqual(['/model']);
		expect(p.getSuggestions('not-slash')).toEqual([]);
	});

	it('case-insensitive prefix', () => {
		const p = new CommandProvider([{ name: 'Model' }]);
		expect(p.getSuggestions('/model').length).toBe(1);
	});
});

describe('FileProvider', () => {
	it('suggests files and dirs by prefix', () => {
		const dir = mkdtempSync(join(tmpdir(), 'tui-fp-'));
		try {
			writeFileSync(join(dir, 'alpha.txt'), '');
			writeFileSync(join(dir, 'beta.txt'), '');
			mkdirSync(join(dir, 'alpha-dir'));
			const p = new FileProvider(dir);
			const s = p.getSuggestions('al');
			expect(s.map((x) => x.label).sort()).toEqual(['alpha-dir/', 'alpha.txt']);
			expect(p.getSuggestions('/x')).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('CombinedAutocompleteProvider', () => {
	it('uses first provider with suggestions', () => {
		const cmd = new CommandProvider([{ name: 'help' }]);
		const file = new FileProvider(tmpdir());
		const c = new CombinedAutocompleteProvider([cmd, file]);
		expect(c.getSuggestions('/he')[0]!.label).toBe('/help');
		expect(c.getSuggestions('').length).toBe(0); // FileProvider 空输入无建议
	});
});
