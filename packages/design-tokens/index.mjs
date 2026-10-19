/* 从设计源数据读取语义色，供终端与非 DOM 宿主复用。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import tokens from "./tokens.json" with { type: "json" };

/** 返回只读明暗主题；不读取 DOM、不改变宿主主题偏好。 */
function palette(mode) {
  const color = (group, name) => tokens.color[group][name].$value[mode].toLowerCase();
  return Object.freeze({
    brand: color("brand", "primary"), brandHover: color("brand", "hover"), onBrand: color("brand", "on-primary"),
    canvas: color("bg", "canvas"), canvasSecondary: color("bg", "secondary"),
    surface: color("bg", "surface"), elevated: color("bg", "elevated"),
    text: color("text", "primary"), textSecondary: color("text", "secondary"), textTertiary: color("text", "tertiary"),
    border: color("border", "default"), divider: color("border", "divider"),
    success: color("semantic", "success"), warning: color("semantic", "warning"),
    error: color("semantic", "error"), info: color("semantic", "info"),
  });
}

export const palettes = Object.freeze({ light: palette("light"), dark: palette("dark") });
