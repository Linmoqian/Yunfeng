import { useEffect, useRef, useState } from "react";

interface NewTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (cwd: string, message: string) => Promise<void>;
}

export function NewTaskDialog({ open, onClose, onCreate }: NewTaskDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [cwd, setCwd] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cwd.trim() || !message.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await onCreate(cwd.trim(), message.trim());
      setCwd("");
      setMessage("");
      onClose();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "创建任务失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog ref={dialogRef} className="new-task-dialog" onCancel={handleCancel} aria-labelledby="new-task-title">
      <form className="new-task-dialog__form" onSubmit={handleSubmit}>
        <div className="new-task-dialog__header">
          <div>
            <p className="eyebrow">开始一段新的工作</p>
            <h2 id="new-task-title">新建任务</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭新建任务">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <label htmlFor="task-cwd">项目路径</label>
        <input
          id="task-cwd"
          value={cwd}
          onChange={(event) => setCwd(event.target.value)}
          placeholder="/path/to/project"
          autoComplete="off"
          disabled={submitting}
        />
        <label htmlFor="task-prompt">你要完成什么？</label>
        <textarea
          id="task-prompt"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="描述目标、约束或希望 Agent 先做的事情"
          rows={4}
          disabled={submitting}
        />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="new-task-dialog__footer">
          <button className="button button--quiet" type="button" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button className="button button--primary" type="submit" disabled={submitting || !cwd.trim() || !message.trim()}>
            {submitting ? "正在创建" : "开始任务"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
