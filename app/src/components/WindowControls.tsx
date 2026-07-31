import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "@/lib/platform";

/** macOS 风格窗口控制（仅 Tauri 运行时渲染；浏览器预览隐藏）。 */
export function WindowControls() {
  if (!isTauriRuntime()) return null;
  const appWindow = getCurrentWindow();

  return (
    <div className="window-controls" data-tauri-drag-region>
      <button
        type="button"
        className="window-control window-close"
        title="关闭"
        onClick={() => void appWindow.close()}
      />
      <button
        type="button"
        className="window-control window-minimize"
        title="最小化"
        onClick={() => void appWindow.minimize()}
      />
      <button
        type="button"
        className="window-control window-zoom"
        title="最大化/还原"
        onClick={() => void appWindow.toggleMaximize()}
      />
    </div>
  );
}
