import { useEffect, useRef, useState } from "react";
import { MapleStatusMark } from "./MapleStatusMark";
import type { TaskSummary } from "./taskPresentation";

interface TaskFocusPanelProps {
  task: TaskSummary | null;
  onClose: () => void;
  onSend: (taskId: string, message: string) => Promise<void>;
}

const STAGES = ["开始", "执行", "验证", "完成"];

export function TaskFocusPanel({ task, onClose, onSend }: TaskFocusPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (task && !dialog.open) {
      setMessage("");
      setFeedback(null);
      dialog.showModal();
    } else if (!task && dialog.open) {
      dialog.close();
    }
  }, [task]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task || !message.trim() || sending) return;

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

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  const activeStage = task?.section === "completed" ? 3 : task?.section === "running" ? 1 : 0;

  return (
    <dialog ref={dialogRef} className="focus-panel" onCancel={handleCancel} aria-labelledby="focus-panel-title">
      {task ? (
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
      ) : null}
    </dialog>
  );
}
