/**
 * 云枫 TUI 主题层：明暗双主题 + 终端配色探测。
 *
 * 颜色 token 与 docs/design/yunfeng-tokens.css 保持一致；
 * 明暗自动探测参考 pi 的 terminal-colors 与 OpenTUI 的 theme_mode：
 * 通过 OSC 10/11 查询终端前/背景色，并按背景亮度选择主题。
 */
export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'auto';

export interface YunfengTheme {
	mode: ThemeMode;
	/** 品牌色（主操作 / 链接） */
	brand: string;
	/** 品牌色 hover */
	brandHover: string;
	/** 品牌色上的前景 */
	onBrand: string;
	/** 画布底色 */
	canvas: string;
	/** 次级背景 */
	canvasSecondary: string;
	/** 卡片表面 */
	surface: string;
	/** 浮层表面 */
	elevated: string;
	/** 正文 */
	text: string;
	/** 次级文字 */
	textSecondary: string;
	/** 弱化文字 */
	textTertiary: string;
	/** 普通边界 */
	border: string;
	/** 分割线 */
	divider: string;
	/** 成功 / 已完成 */
	success: string;
	/** 警告 / 等待介入 */
	warning: string;
	/** 错误 / 失败 */
	error: string;
	/** 信息 / 说明 */
	info: string;
}

export const YUNFENG_LIGHT_THEME: Readonly<YunfengTheme> = {
	mode: 'light',
	brand: '#0066cc',
	brandHover: '#0071e3',
	onBrand: '#ffffff',
	canvas: '#ffffff',
	canvasSecondary: '#f5f5f7',
	surface: '#fafafc',
	elevated: '#ffffff',
	text: '#1d1d1f',
	textSecondary: '#6e6e73',
	textTertiary: '#86868b',
	border: '#d2d2d7',
	divider: '#f0f0f0',
	success: '#34c759',
	warning: '#ff9500',
	error: '#ff3b30',
	info: '#0066cc',
};

export const YUNFENG_DARK_THEME: Readonly<YunfengTheme> = {
	mode: 'dark',
	brand: '#2997ff',
	brandHover: '#4da3ff',
	onBrand: '#ffffff',
	canvas: '#000000',
	canvasSecondary: '#1c1c1e',
	surface: '#2c2c2e',
	elevated: '#333336',
	text: '#f5f5f7',
	textSecondary: '#98989d',
	textTertiary: '#636366',
	border: '#3a3a3c',
	divider: '#2c2c2e',
	success: '#30d158',
	warning: '#ff9f0a',
	error: '#ff453a',
	info: '#2997ff',
};

let themePreference: ThemePreference = 'auto';
let activeMode: ThemeMode = 'dark';

/** 解析 YUNFENG_TUI_THEME：light / dark / auto（默认 auto） */
export function resolveThemePreference(env: NodeJS.ProcessEnv = process.env): ThemePreference {
	const value = env.YUNFENG_TUI_THEME?.trim().toLowerCase();
	if (value === 'light' || value === 'dark' || value === 'auto') return value;
	return 'auto';
}

/**
 * 用环境变量初始化主题。默认 auto 时先落 dark（现代终端主流），
 * 待 OSC 探测结果返回后再由 applyDetectedThemeMode 修正。
 */
export function initYunfengTheme(env: NodeJS.ProcessEnv = process.env): void {
	const preference = resolveThemePreference(env);
	themePreference = preference;
	activeMode = preference === 'auto' ? 'dark' : preference;
}

/** 设置显式偏好；auto 表示允许终端探测覆盖 */
export function setThemePreference(preference: ThemePreference): void {
	themePreference = preference;
	if (preference !== 'auto') activeMode = preference;
}

export function getThemePreference(): ThemePreference {
	return themePreference;
}

/** 当前生效主题模式 */
export function getYunfengThemeMode(): ThemeMode {
	return activeMode;
}

/** 强制设置当前主题模式（不改变用户偏好） */
export function setYunfengThemeMode(mode: ThemeMode): void {
	activeMode = mode;
}

/** 终端探测结果：仅在 auto 偏好下生效 */
export function applyDetectedThemeMode(mode: ThemeMode): ThemeMode {
	if (themePreference === 'auto') activeMode = mode;
	return activeMode;
}

export function getYunfengTheme(): YunfengTheme {
	return activeMode === 'light' ? YUNFENG_LIGHT_THEME : YUNFENG_DARK_THEME;
}

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

export interface OscColorReport {
	/** OSC 目标：10=前景，11=背景 */
	target: 10 | 11;
	color: RgbColor;
}

/** 完整 OSC 10/11 响应（BEL 或 ST 结尾） */
// eslint-disable-next-line no-control-regex -- OSC 响应必须按原始控制字符匹配
const OSC_COLOR_REPORT_RE = /\x1b\](10|11);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

function parseHexChannel(channel: string): number | undefined {
	if (!/^[0-9a-f]+$/i.test(channel)) return undefined;
	const max = 16 ** channel.length - 1;
	if (max <= 0) return undefined;
	return Math.round((parseInt(channel, 16) / max) * 255);
}

function parseColorValue(value: string): RgbColor | null {
	const body = value.trim();
	if (body.startsWith('#')) {
		const hex = body.slice(1);
		if (/^[0-9a-f]{6}$/i.test(hex)) {
			return {
				r: parseInt(hex.slice(0, 2), 16),
				g: parseInt(hex.slice(2, 4), 16),
				b: parseInt(hex.slice(4, 6), 16),
			};
		}
		if (/^[0-9a-f]{12}$/i.test(hex)) {
			const r = parseHexChannel(hex.slice(0, 4));
			const g = parseHexChannel(hex.slice(4, 8));
			const b = parseHexChannel(hex.slice(8, 12));
			return r !== undefined && g !== undefined && b !== undefined ? { r, g, b } : null;
		}
		return null;
	}
	const normalized = body.replace(/^rgba?:/i, '');
	const [red, green, blue] = normalized.split('/');
	if (red === undefined || green === undefined || blue === undefined) return null;
	const r = parseHexChannel(red);
	const g = parseHexChannel(green);
	const b = parseHexChannel(blue);
	return r !== undefined && g !== undefined && b !== undefined ? { r, g, b } : null;
}

/** 从输入块中摘出完整的 OSC 10/11 响应；remainder 保留其它内容 */
export function parseOscColorReports(data: string): { reports: OscColorReport[]; remainder: string } {
	const reports: OscColorReport[] = [];
	let remainder = '';
	let cursor = 0;
	for (const match of data.matchAll(OSC_COLOR_REPORT_RE)) {
		remainder += data.slice(cursor, match.index);
		const target = Number(match[1]) === 11 ? 11 : 10;
		const color = parseColorValue(match[2] ?? '');
		if (color) reports.push({ target, color });
		cursor = match.index + match[0].length;
	}
	remainder += data.slice(cursor);
	return { reports, remainder };
}

function relativeLuminance(color: RgbColor): number {
	const channel = (value: number): number => {
		const v = value / 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** 按背景亮度判定主题：深色背景 -> dark，浅色背景 -> light */
export function themeModeFromBackground(color: RgbColor): ThemeMode {
	return relativeLuminance(color) < 0.5 ? 'dark' : 'light';
}

/** 按前景亮度反推主题：浅色文字通常出现在深色终端 */
export function themeModeFromForeground(color: RgbColor): ThemeMode {
	return relativeLuminance(color) >= 0.5 ? 'dark' : 'light';
}

/** 取最近一次背景报告；没有背景时以前景反推 */
export function themeModeFromReports(reports: OscColorReport[]): ThemeMode | null {
	let background: RgbColor | null = null;
	let foreground: RgbColor | null = null;
	for (const report of reports) {
		if (report.target === 11) background = report.color;
		else foreground = report.color;
	}
	if (background) return themeModeFromBackground(background);
	if (foreground) return themeModeFromForeground(foreground);
	return null;
}
