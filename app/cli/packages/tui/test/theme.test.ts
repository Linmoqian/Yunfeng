import { afterEach, describe, expect, it } from 'vitest';
import {
	applyDetectedThemeMode,
	getThemePreference,
	getYunfengTheme,
	getYunfengThemeMode,
	initYunfengTheme,
	parseOscColorReports,
	resolveThemePreference,
	setThemePreference,
	themeModeFromBackground,
	themeModeFromForeground,
	themeModeFromReports,
	YUNFENG_DARK_THEME,
	YUNFENG_LIGHT_THEME,
} from '../src/theme.js';

afterEach(() => {
	// 恢复测试默认值，避免主题全局状态串到其它用例
	setThemePreference('dark');
});

describe('resolveThemePreference', () => {
	it('reads YUNFENG_TUI_THEME', () => {
		expect(resolveThemePreference({ YUNFENG_TUI_THEME: 'light' })).toBe('light');
		expect(resolveThemePreference({ YUNFENG_TUI_THEME: 'DARK' })).toBe('dark');
		expect(resolveThemePreference({ YUNFENG_TUI_THEME: 'auto' })).toBe('auto');
		expect(resolveThemePreference({})).toBe('auto');
		expect(resolveThemePreference({ YUNFENG_TUI_THEME: 'blue' })).toBe('auto');
	});
});

describe('theme state', () => {
	it('auto 初始为 dark，等待探测结果修正', () => {
		initYunfengTheme({});
		expect(getThemePreference()).toBe('auto');
		expect(getYunfengThemeMode()).toBe('dark');
		expect(applyDetectedThemeMode('light')).toBe('light');
		expect(getYunfengTheme()).toBe(YUNFENG_LIGHT_THEME);
	});

	it('显式偏好不被探测覆盖', () => {
		setThemePreference('light');
		expect(applyDetectedThemeMode('dark')).toBe('light');
		expect(getYunfengThemeMode()).toBe('light');
		expect(getYunfengTheme()).toBe(YUNFENG_LIGHT_THEME);
	});

	it('切换偏好立即生效', () => {
		setThemePreference('dark');
		expect(getYunfengTheme()).toBe(YUNFENG_DARK_THEME);
	});
});

describe('OSC 10/11 主题探测', () => {
	it('解析 hex 与 rgb 格式响应并保留 remainder', () => {
		const data = '\x1b]10;#ffffff\x07keep\x1b]11;rgb:0000/0000/0000\x1b\\tail';
		const { reports, remainder } = parseOscColorReports(data);
		expect(reports).toHaveLength(2);
		expect(reports[0]).toEqual({ target: 10, color: { r: 255, g: 255, b: 255 } });
		expect(reports[1]).toEqual({ target: 11, color: { r: 0, g: 0, b: 0 } });
		expect(remainder).toBe('keeptail');
	});

	it('不完整响应不解析也不吞掉后续输入', () => {
		const { reports, remainder } = parseOscColorReports('\x1b]11;rgb:0000/0000');
		expect(reports).toHaveLength(0);
		expect(remainder).toBe('\x1b]11;rgb:0000/0000');
	});

	it('按背景亮度选择主题，背景缺失时以前景反推', () => {
		expect(themeModeFromBackground({ r: 20, g: 20, b: 20 })).toBe('dark');
		expect(themeModeFromBackground({ r: 250, g: 250, b: 250 })).toBe('light');
		expect(themeModeFromForeground({ r: 230, g: 230, b: 230 })).toBe('dark');
		expect(themeModeFromReports([{ target: 10, color: { r: 30, g: 30, b: 30 } }])).toBe('light');
		expect(
			themeModeFromReports([
				{ target: 10, color: { r: 230, g: 230, b: 230 } },
				{ target: 11, color: { r: 255, g: 255, b: 255 } },
			]),
		).toBe('light');
	});

	it('主题 token 与项目设计 token 一致', () => {
		expect(YUNFENG_LIGHT_THEME.brand).toBe('#0066cc');
		expect(YUNFENG_DARK_THEME.brand).toBe('#2997ff');
		expect(YUNFENG_LIGHT_THEME.canvas).toBe('#ffffff');
		expect(YUNFENG_DARK_THEME.canvas).toBe('#000000');
	});
});
