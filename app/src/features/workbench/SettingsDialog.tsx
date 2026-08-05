import { useEffect, useRef } from "react";
import type { ModelOption, ModelSelection } from "../../services/taskService";

export type ThemeMode = "system" | "light" | "dark";
type ConnectionState = "connecting" | "connected" | "offline";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  modelSelection: ModelSelection | null;
  modelOptions: ModelOption[];
  modelLoading: boolean;
  modelError: string | null;
  onModelChange: (model: ModelSelection | null) => void;
  onRetryModels: () => void;
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
  modelSelection,
  modelOptions,
  modelLoading,
  modelError,
  onModelChange,
  onRetryModels,
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

  const selectedModelKey = modelSelection ? `${modelSelection.provider}:${modelSelection.modelId}` : "";

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

        <section className="settings-dialog__section" aria-labelledby="settings-model-title">
          <div className="settings-dialog__section-copy">
            <h3 id="settings-model-title">模型</h3>
            <p>新建任务会使用这里选定的模型，已有任务可在详情中单独切换。</p>
          </div>
          {modelLoading ? (
            <p className="settings-dialog__model-status" role="status">正在读取可用模型…</p>
          ) : modelError ? (
            <div className="settings-dialog__model-error" role="alert">
              <span>{modelError}</span>
              <button className="text-button" type="button" onClick={onRetryModels}>重新读取</button>
            </div>
          ) : modelOptions.length > 0 ? (
            <label className="settings-dialog__model-field" htmlFor="settings-model">
              <span>新任务默认模型</span>
              <select
                id="settings-model"
                value={selectedModelKey}
                onChange={(event) => {
                  const [provider, ...modelIdParts] = event.target.value.split(":");
                  const modelId = modelIdParts.join(":");
                  onModelChange(provider && modelId ? { provider, modelId } : null);
                }}
              >
                <option value="">跟随服务器默认</option>
                {modelOptions.map((model) => (
                  <option key={`${model.provider}:${model.id}`} value={`${model.provider}:${model.id}`}>
                    {model.provider} · {model.name || model.id}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="settings-dialog__model-status">当前没有可用模型，请先配置 pi 的模型凭据。</p>
          )}
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
