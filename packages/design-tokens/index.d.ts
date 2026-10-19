/* 非 DOM 宿主使用的设计语义类型。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
export interface Palette {
  readonly brand: string; readonly brandHover: string; readonly onBrand: string;
  readonly canvas: string; readonly canvasSecondary: string; readonly surface: string; readonly elevated: string;
  readonly text: string; readonly textSecondary: string; readonly textTertiary: string;
  readonly border: string; readonly divider: string;
  readonly success: string; readonly warning: string; readonly error: string; readonly info: string;
}
export const palettes: Readonly<{ light: Palette; dark: Palette }>;
