/** 是否运行在 Tauri 桌面运行时中（区别于纯浏览器预览）。 */
export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
