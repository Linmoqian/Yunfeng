/* 平台只影响窗口外观，浏览器预览不模拟原生窗口操作。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
export type WindowPlatform = "macos" | "windows" | "linux" | "browser";
/** 根据 Tauri 环境和 WebView 平台标识选择窗口控件。 */
export function resolveWindowPlatform(native: boolean, userAgent: string): WindowPlatform {
  if (!native) return "browser";
  if (/Macintosh|Mac OS X/.test(userAgent)) return "macos";
  return /Windows/.test(userAgent) ? "windows" : "linux";
}
/** 获取当前窗口的平台；独立浏览器预览返回 browser。 */
export function getRuntimeWindowPlatform(): WindowPlatform {
  return resolveWindowPlatform("__TAURI_INTERNALS__" in window, navigator.userAgent);
}
