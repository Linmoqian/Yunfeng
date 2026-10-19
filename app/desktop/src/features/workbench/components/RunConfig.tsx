import { App, Collapse, Select, Switch } from "antd";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import {
  loadTaskCapabilities,
  sendTaskCommand,
  type ModelCatalog,
  type TaskCapabilitiesResult,
  type TaskState,
} from "../../../services/taskService";

interface RunConfigProps {
  task: TaskState;
  modelCatalog?: ModelCatalog;
}

export function RunConfig({ task, modelCatalog }: RunConfigProps) {
  const { message } = App.useApp();
  const [capabilities, setCapabilities] = useState<TaskCapabilitiesResult | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const running = task.status === "running" || task.status === "waiting_approval";
  const configDisabled = running || busy;

  const modelKey = (capa: TaskCapabilitiesResult): string =>
    capa.model ? `${capa.model.provider}:${capa.model.modelId}` : "";
  const selectedModelKey = capabilities ? modelKey(capabilities) : "";
  const currentThinkingLevels = (modelCatalog?.thinkingLevels ?? {})[selectedModelKey] ?? [];

  async function refresh() {
    try {
      const capa = await loadTaskCapabilities(task.id);
      setCapabilities(capa);
    } catch {
      setCapabilities(null);
    }
  }

  function handleToggleOpen(keys: string | string[]) {
    const nextOpen = Array.isArray(keys) ? keys.length > 0 : Boolean(keys);
    setOpen(nextOpen);
    if (nextOpen && !capabilities) void refresh();
  }

  async function handleSetModel(nextKey: string) {
    if (!nextKey) return;
    const [provider, modelId] = nextKey.split(":");
    if (!provider || !modelId) return;
    setBusy(true);
    try {
      await sendTaskCommand(task.id, { type: "setModel", provider, modelId });
      message.success(`已切换到 ${modelId}。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "切换模型失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetThinkingLevel(level: string) {
    setBusy(true);
    try {
      await sendTaskCommand(task.id, { type: "setThinkingLevel", level });
      message.success(`思考等级已设为 ${level}。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "切换思考等级失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleTool(toolName: string, active: boolean) {
    if (!capabilities) return;
    const draft = capabilities.tools.map((tool) =>
      tool.name === toolName ? { ...tool, active } : tool,
    );
    setCapabilities({ ...capabilities, tools: draft });
    setBusy(true);
    try {
      const names = draft.filter((tool) => tool.active).map((tool) => tool.name);
      await sendTaskCommand(task.id, { type: "setTools", toolNames: names });
      message.success("工具已更新。");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新工具失败。");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Collapse
      ghost
      className="config-collapse"
      items={[
        {
          key: "config",
          label: (
            <span className="focus-panel__config-toggle-label">
              运行配置
              {configDisabled ? " · 运行中禁切" : ""}
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          ),
          children: (
            <div className="focus-panel__config-body">
              <div className="focus-panel__config-field">
                <label className="focus-panel__config-label" htmlFor="config-model">模型</label>
                <Select
                  id="config-model"
                  className="focus-panel__config-select"
                  value={selectedModelKey || undefined}
                  onChange={(value) => void handleSetModel(value)}
                  disabled={configDisabled}
                  placeholder="选择模型"
                  allowClear={false}
                  options={(modelCatalog?.models ?? []).map((model) => ({
                    value: `${model.provider}:${model.id}`,
                    label: `${model.name}（${model.provider}）`,
                  }))}
                />
              </div>
              {currentThinkingLevels.length > 0 ? (
                <div className="focus-panel__config-field">
                  <label className="focus-panel__config-label" htmlFor="config-thinking">思考等级</label>
                  <Select
                    id="config-thinking"
                    className="focus-panel__config-select"
                    value={capabilities?.thinkingLevel ?? undefined}
                    onChange={(value) => void handleSetThinkingLevel(value)}
                    disabled={configDisabled}
                    placeholder="选择思考等级"
                    options={currentThinkingLevels.map((level) => ({ value: level, label: level }))}
                  />
                </div>
              ) : (
                <p className="focus-panel__config-note">当前模型不支持切分思考等级。</p>
              )}
              <div className="focus-panel__config-field">
                <span className="focus-panel__config-label">工具</span>
                {!capabilities?.tools.length ? (
                  <p className="focus-panel__config-note">暂无工具信息。</p>
                ) : (
                  <div className="focus-panel__tool-list">
                    {capabilities.tools.map((tool) => (
                      <label key={tool.name} className="tool-switch">
                        <Switch
                          size="small"
                          checked={tool.active}
                          disabled={configDisabled}
                          onChange={(checked) => void handleToggleTool(tool.name, checked)}
                        />
                        <span>{tool.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        },
      ]}
      onChange={(keys) => handleToggleOpen(keys)}
    />
  );
}
