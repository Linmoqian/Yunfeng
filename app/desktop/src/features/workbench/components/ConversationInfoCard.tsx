import { App, Button, Select, Switch } from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  loadSessionDetails,
  loadSessionRuntimeState,
  sendTaskCommand,
  type ModelCatalog,
  type SessionDetails,
  type SessionRuntimeState,
  type SessionSnapshot,
  type TaskState,
} from "../../../services/taskService";
import {
  buildConversationBranchTree,
  findLatestEffectiveUsage,
  formatThinkingLevel,
  formatTokenCount,
  getCacheHitPercent,
  type ConversationBranchNode,
} from "../conversationInfo";

interface ConversationInfoCardProps {
  sessionId: string;
  currentTitle: string;
  sessions: SessionSnapshot[];
  task?: TaskState | null;
  modelCatalog?: ModelCatalog;
  refreshKey: string;
  showThinking: boolean;
  onShowThinkingChange: (show: boolean) => void;
  onTaskUpdated: (task: TaskState) => void;
}

function BranchItem({ node }: { node: ConversationBranchNode }) {
  return (
    <li className="conversation-info-card__branch-item">
      <div
        className={`conversation-info-card__branch ${node.current ? "conversation-info-card__branch--current" : ""}`.trim()}
        aria-current={node.current ? "true" : undefined}
        title={node.title}
      >
        <span className="conversation-info-card__branch-dot" aria-hidden="true" />
        <span>{node.title}</span>
        {node.current ? <em>当前</em> : null}
      </div>
      {node.children.length > 0 ? (
        <ul>{node.children.map((child) => <BranchItem key={child.id} node={child} />)}</ul>
      ) : null}
    </li>
  );
}

export function ConversationInfoCard({
  sessionId,
  currentTitle,
  sessions,
  task,
  modelCatalog,
  refreshKey,
  showThinking,
  onShowThinkingChange,
  onTaskUpdated,
}: ConversationInfoCardProps) {
  const { message } = App.useApp();
  const [details, setDetails] = useState<SessionDetails | null>(null);
  const [runtimeState, setRuntimeState] = useState<SessionRuntimeState | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);

  useEffect(() => {
    if (!sessionId) return undefined;
    const controller = new AbortController();
    void Promise.allSettled([
      loadSessionDetails(sessionId, controller.signal),
      loadSessionRuntimeState(sessionId, controller.signal),
    ]).then(([detailsResult, stateResult]) => {
      if (controller.signal.aborted) return;
      if (detailsResult.status === "fulfilled") setDetails(detailsResult.value);
      if (stateResult.status === "fulfilled") setRuntimeState(stateResult.value);
    });
    return () => controller.abort();
  }, [refreshKey, refreshRevision, sessionId]);

  const messages = details?.context?.messages ?? [];
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" && message.model);
  const resolvedModel = task?.model
    ?? details?.context?.model
    ?? (runtimeState?.state?.model
      ? { provider: runtimeState.state.model.provider, modelId: runtimeState.state.model.id }
      : latestAssistant?.model
        ? { provider: latestAssistant.provider ?? "", modelId: latestAssistant.model }
        : undefined);
  const modelOption = resolvedModel
    ? modelCatalog?.models.find((item) => item.provider === resolvedModel.provider && item.id === resolvedModel.modelId)
    : undefined;
  const modelLabel = modelOption?.name ?? resolvedModel?.modelId ?? "—";
  const thinkingLabel = formatThinkingLevel(
    task?.thinkingLevel ?? runtimeState?.state?.thinkingLevel ?? details?.context?.thinkingLevel,
  );
  const usage = findLatestEffectiveUsage(messages);
  const cacheHit = getCacheHitPercent(usage);
  const runtimeContext = runtimeState?.state?.contextUsage;
  const contextLabel = runtimeContext
    ? `${formatTokenCount(runtimeContext.tokens)} / ${formatTokenCount(runtimeContext.contextWindow)}`
    : usage ? `${formatTokenCount(usage.totalTokens)} tokens` : "—";
  const contextTitle = runtimeContext ? `上下文已使用 ${Math.round(runtimeContext.percent)}%` : "当前上下文 token 数";
  const branches = useMemo(
    () => buildConversationBranchTree(sessions, sessionId, currentTitle),
    [currentTitle, sessionId, sessions],
  );
  const running = task?.status === "running" || task?.status === "waiting_approval";
  const controlsDisabled = !task || running || busyAction !== null;
  const selectedModelKey = resolvedModel ? `${resolvedModel.provider}:${resolvedModel.modelId}` : undefined;
  const thinkingLevels = selectedModelKey ? modelCatalog?.thinkingLevels[selectedModelKey] ?? [] : [];

  async function handleSetModel(value: string) {
    if (!task) return;
    const separatorIndex = value.indexOf(":");
    if (separatorIndex < 1) return;
    const provider = value.slice(0, separatorIndex);
    const modelId = value.slice(separatorIndex + 1);
    setBusyAction("model");
    try {
      await sendTaskCommand(task.id, { type: "setModel", provider, modelId });
      onTaskUpdated({ ...task, model: { provider, modelId } });
      message.success(`已切换到 ${modelId}。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "切换模型失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSetThinkingLevel(level: string) {
    if (!task) return;
    setBusyAction("thinking");
    try {
      await sendTaskCommand(task.id, { type: "setThinkingLevel", level });
      onTaskUpdated({ ...task, thinkingLevel: level });
      message.success(`思考强度已设为${formatThinkingLevel(level)}。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "切换思考强度失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCompact() {
    if (!task) return;
    setBusyAction("compact");
    try {
      await sendTaskCommand(task.id, { type: "compact" });
      setRefreshRevision((revision) => revision + 1);
      message.success("上下文压缩完成。");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "上下文压缩失败。");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <aside className="conversation-info-card" aria-label="会话信息">
      <header className="conversation-info-card__header">
        <span>会话信息</span>
        <span className="conversation-info-card__live-dot" aria-hidden="true" />
      </header>

      <section className="conversation-info-card__section" aria-labelledby="conversation-model-title">
        <h3 id="conversation-model-title">模型</h3>
        <div className="conversation-info-card__controls">
          <div className="conversation-info-card__control-row">
            <label htmlFor="conversation-info-model">模型</label>
            <Select
              id="conversation-info-model"
              className="conversation-info-card__select"
              size="small"
              variant="borderless"
              value={selectedModelKey}
              placeholder={modelLabel}
              disabled={controlsDisabled}
              onChange={(value) => void handleSetModel(value)}
              options={(modelCatalog?.models ?? []).map((item) => ({
                value: `${item.provider}:${item.id}`,
                label: item.name,
              }))}
            />
          </div>
          <div className="conversation-info-card__control-row">
            <label htmlFor="conversation-info-thinking">思考强度</label>
            <Select
              id="conversation-info-thinking"
              className="conversation-info-card__select"
              size="small"
              variant="borderless"
              value={task?.thinkingLevel ?? details?.context?.thinkingLevel}
              placeholder={thinkingLabel}
              disabled={controlsDisabled || thinkingLevels.length === 0}
              onChange={(value) => void handleSetThinkingLevel(value)}
              options={thinkingLevels.map((level) => ({ value: level, label: formatThinkingLevel(level) }))}
            />
          </div>
          <div className="conversation-info-card__metric-row">
            <span>缓存 / 上下文</span>
            <strong>
              <span title="最近一轮有效响应的缓存命中率">{cacheHit === null ? "—" : `${cacheHit}%`}</span>
              <i aria-hidden="true" />
              <span title={contextTitle}>{contextLabel}</span>
            </strong>
          </div>
          <div className="conversation-info-card__action-row">
            <Button
              type="text"
              size="small"
              disabled={controlsDisabled}
              loading={busyAction === "compact"}
              onClick={() => void handleCompact()}
            >
              压缩上下文
            </Button>
            <span className="conversation-info-card__action-divider" aria-hidden="true" />
            <label className="conversation-info-card__thinking-toggle">
              <span>显示思考</span>
              <Switch size="small" checked={showThinking} onChange={onShowThinkingChange} />
            </label>
          </div>
        </div>
      </section>

      <div className="conversation-info-card__separator" aria-hidden="true" />

      <section className="conversation-info-card__section" aria-labelledby="conversation-branch-title">
        <div className="conversation-info-card__section-heading">
          <h3 id="conversation-branch-title">对话</h3>
          <span>{branches.length > 0 ? "聊天分支" : "暂无分支"}</span>
        </div>
        {branches.length > 0 ? (
          <div className="conversation-info-card__tree" aria-label="聊天分支树">
            <ul>{branches.map((branch) => <BranchItem key={branch.id} node={branch} />)}</ul>
          </div>
        ) : null}
      </section>
    </aside>
  );
}
