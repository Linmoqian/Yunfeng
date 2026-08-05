import { useEffect, useRef } from "react";

export type ThemeMode = "system" | "light" | "dark";
type ConnectionState = "connecting" | "connected" | "offline";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  connectionState: ConnectionState;
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; description: string }> = [
  { value: "system", label: "跟随系统", description: "自动适配设备外观" },
  { value: "light", label: "浅色主题", description: "保留纸张般的明亮感" },
  { value: "dark", label: "深色主题", description: "降低夜间阅读的干扰" },
];

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "正在连接",
  connected: "已同步",
  offline: "状态可能已过期",
};

export function SettingsDialog({
  open,
  onClose,
  themeMode,
  onThemeChange,
  connectionState,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog ref={dialogRef} className="settings-dialog" onCancel={handleCancel} aria-labelledby="settings-title">
      <div className="settings-dialog__body">
        <header className="settings-dialog__header">
          <div>
            <p className="eyebrow">工作台偏好</p>
            <h2 id="settings-title">设置</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section className="settings-dialog__section" aria-labelledby="settings-appearance-title">
          <div className="settings-dialog__section-copy">
            <h3 id="settings-appearance-title">外观</h3>
            <p>选择工作台在不同光线里的状态。</p>
          </div>
          <div className="settings-dialog__theme-options" role="group" aria-label="主题">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`settings-dialog__theme-option ${themeMode === option.value ? "settings-dialog__theme-option--active" : ""}`}
                type="button"
                aria-pressed={themeMode === option.value}
                onClick={() => onThemeChange(option.value)}
              >
                <span>{option.label}</span>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-dialog__section" aria-labelledby="settings-connection-title">
          <div className="settings-dialog__section-copy">
            <h3 id="settings-connection-title">连接</h3>
            <p>任务状态通过后端事件流持续同步。</p>
          </div>
          <div className={`settings-dialog__connection settings-dialog__connection--${connectionState}`}>
            <span className="connection-state__dot" aria-hidden="true" />
            <span>{CONNECTION_LABELS[connectionState]}</span>
          </div>
        </section>

        <footer className="settings-dialog__footer">
          <button className="button button--primary" type="button" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </dialog>
  );
}
