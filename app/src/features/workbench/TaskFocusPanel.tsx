import { useEffect, useState } from "react";
import type { ModelOption, ModelSelection } from "../../services/taskService";
import { MapleStatusMark } from "./MapleStatusMark";
import type { TaskSummary } from "./taskPresentation";

interface TaskFocusPanelProps {
  task: TaskSummary;
  onClose: () => void;
  onSend: (taskId: string, message: string) => Promise<void>;
  model: ModelSelection | null;
  modelOptions: ModelOption[];
  modelLoading: boolean;
  modelError: string | null;
  onModelChange: (taskId: string, model: ModelSelection) => Promise<void>;
}

const STAGES = ["开始", "执行", "验证", "完成"];

export function TaskFocusPanel({
  task,
  onClose,
  onSend,
  model,
  modelOptions,
  modelLoading,
  modelError,
  onModelChange,
}: TaskFocusPanelProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modelChanging, setModelChanging] = useState(false);
  const [modelFeedback, setModelFeedback] = useState<string | null>(null);

  useEffect(() => {
    setMessage("");
    setFeedback(null);
    setModelFeedback(null);
  }, [task.id]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || sending) return;

    setSending(true);
    setFeedback(null);
    try {
      await onSend(task.id, message.trim());
      setMessage("");
      setFeedback("已发送，任务会在状态更新后回到工作台。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "发送失败，请稍后重试。");
    } finally {
      setSending(false);
    }
  }

  async function handleModelChange(event: React.ChangeEvent<HTMLSelectElement>) {
    if (!event.target.value || modelChanging) return;
    const [provider, ...modelIdParts] = event.target.value.split(":");
    const modelId = modelIdParts.join(":");
    if (!provider || !modelId) return;

    setModelChanging(true);
    setModelFeedback(null);
    try {
      await onModelChange(task.id, { provider, modelId });
      setModelFeedback("已切换，后续消息会使用这个模型。");
    } catch (error) {
      setModelFeedback(error instanceof Error ? error.message : "模型切换失败，请稍后重试。");
    } finally {
      setModelChanging(false);
    }
  }

  const activeStage = task.section === "completed" ? 3 : task.section === "running" ? 1 : 0;

  return (
    <section className="focus-panel focus-panel--inline" role="region" aria-label="当前会话">
      <div className="focus-panel__body">
        <header className="focus-panel__header">
          <div>
            <p className="eyebrow">{task.projectName}</p>
            <h2 id="focus-panel-title">{task.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭任务详情">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section className={`focus-panel__attention focus-panel__attention--${task.section}`}>
          {task.section === "attention" ? <MapleStatusMark attention /> : null}
          <div>
            <span className="focus-panel__status">{task.statusLabel}</span>
            <p>{task.attentionReason ?? task.currentAction}</p>
          </div>
        </section>

        <section className="focus-panel__section">
          <div className="focus-panel__section-heading">
            <h3>任务轨迹</h3>
            <span>{task.currentAction}</span>
          </div>
          <ol className="task-timeline">
            {STAGES.map((stage, index) => (
              <li key={stage} className={index <= activeStage ? "task-timeline__step--active" : ""}>
                <span className="task-timeline__dot" aria-hidden="true" />
                <span>{stage}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="focus-panel__model" aria-labelledby="task-model-title">
          <div className="focus-panel__section-heading">
            <h3 id="task-model-title">模型</h3>
            <span>后续消息使用</span>
          </div>
          {modelError ? (
            <p className="focus-panel__model-status" role="alert">{modelError}</p>
          ) : modelOptions.length > 0 ? (
            <label className="focus-panel__model-field" htmlFor="task-model">
              <span>当前任务模型</span>
              <select
                id="task-model"
                value={model ? `${model.provider}:${model.modelId}` : ""}
                onChange={(event) => void handleModelChange(event)}
                disabled={modelLoading || modelChanging}
              >
                <option value="">正在读取当前模型…</option>
                {modelOptions.map((option) => (
                  <option key={`${option.provider}:${option.id}`} value={`${option.provider}:${option.id}`}>
                    {option.provider} · {option.name || option.id}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="focus-panel__model-status">当前没有可用模型。</p>
          )}
          {modelFeedback ? (
            <p
              className={`focus-panel__model-feedback ${modelFeedback.includes("失败") ? "focus-panel__model-feedback--error" : ""}`}
              role={modelFeedback.includes("失败") ? "alert" : "status"}
            >
              {modelFeedback}
            </p>
          ) : null}
        </section>

        <details className="focus-panel__process">
          <summary>查看过程</summary>
          <p>当前展示任务状态摘要。实时工具调用和完整日志会在任务执行时从 Agent 事件流加载。</p>
        </details>

        <form className="focus-panel__composer" onSubmit={handleSubmit}>
          <label htmlFor="task-message">继续这个任务</label>
          <textarea
            id="task-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="补充要求、回答问题，或告诉 Agent 下一步"
            rows={3}
            disabled={sending}
          />
          <div className="focus-panel__composer-footer">
            <span role={feedback && feedback.includes("失败") ? "alert" : "status"}>{feedback}</span>
            <button className="button button--primary" type="submit" disabled={sending || !message.trim()}>
              {sending ? "正在发送" : "发送要求"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
