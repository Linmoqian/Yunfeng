import { Button, Modal, Select, Segmented, Tag, App } from "antd";
import { useState } from "react";

import type { ModelOption, ModelSelection } from "../../services/taskService";
import type { ThemeMode } from "../../theme/ThemeProvider";
import type { ConnectionState } from "../../store/workbenchSlice";

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

const CONNECTION_TONE: Record<ConnectionState, "default" | "success" | "warning" | "error"> = {
  connecting: "warning",
  connected: "success",
  offline: "error",
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
  const { message } = App.useApp();
  const [themeDraft, setThemeDraft] = useState<ThemeMode>(themeMode);
  const selectedModelKey = modelSelection ? `${modelSelection.provider}:${modelSelection.modelId}` : "";

  function handleOk() {
    onThemeChange(themeDraft);
    if (themeDraft !== themeMode) message.success("主题已更新");
    onClose();
  }

  return (
    <Modal
      title={<span className="settings-dialog__title">设置</span>}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="完成"
      cancelText="取消"
      centered
      width={560}
    >
      <div className="settings-dialog__body">
        <p className="eyebrow">工作台偏好</p>

        <section className="settings-dialog__section" aria-labelledby="settings-appearance-title">
          <div className="settings-dialog__section-copy">
            <h3 id="settings-appearance-title">外观</h3>
            <p>选择工作台在不同光线里的状态。</p>
          </div>
          <Segmented
            block
            value={themeDraft}
            onChange={(value) => setThemeDraft(value as ThemeMode)}
            options={THEME_OPTIONS.map((option) => option.label)}
            aria-label="主题"
          />
          <p className="settings-dialog__theme-desc">
            {THEME_OPTIONS.find((option) => option.value === themeDraft)?.description}
          </p>
        </section>

        <section className="settings-dialog__section" aria-labelledby="settings-model-title">
          <div className="settings-dialog__section-copy">
            <h3 id="settings-model-title">模型</h3>
            <p>新建会话会使用这里选定的模型。</p>
          </div>
          {modelLoading ? (
            <p className="settings-dialog__model-status" role="status">正在读取可用模型…</p>
          ) : modelError ? (
            <div className="settings-dialog__model-error" role="alert">
              <span>{modelError}</span>
              <Button size="small" type="link" onClick={onRetryModels}>重新读取</Button>
            </div>
          ) : modelOptions.length > 0 ? (
            <div className="settings-dialog__model-field">
              <span className="settings-dialog__model-label">新会话默认模型</span>
              <Select
                value={selectedModelKey || undefined}
                onChange={(value) => {
                  if (!value) {
                    onModelChange(null);
                    return;
                  }
                  const [provider, ...modelIdParts] = value.split(":");
                  const modelId = modelIdParts.join(":");
                  onModelChange(provider && modelId ? { provider, modelId } : null);
                }}
                placeholder="跟随服务器默认"
                allowClear
                options={[
                  ...modelOptions.map((model) => ({
                    value: `${model.provider}:${model.id}`,
                    label: `${model.provider} · ${model.name || model.id}`,
                  })),
                ]}
              />
            </div>
          ) : (
            <p className="settings-dialog__model-status">当前没有可用模型，请先配置 pi 的模型凭据。</p>
          )}
        </section>

        <section className="settings-dialog__section" aria-labelledby="settings-connection-title">
          <div className="settings-dialog__section-copy">
            <h3 id="settings-connection-title">连接</h3>
            <p>会话状态通过后端事件流持续同步。</p>
          </div>
          <Tag color={CONNECTION_TONE[connectionState]}>{CONNECTION_LABELS[connectionState]}</Tag>
        </section>
      </div>
    </Modal>
  );
}
