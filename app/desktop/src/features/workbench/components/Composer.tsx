/* 会话输入与发送，科研模式统一补充目标，运行控制由状态栏承载。
 * Created on 2026-10-28
 * @author: https://github.com/Linmoqian
 */
import { Button, Input } from "antd";
import { ArrowUp, Code2, FlaskConical, Square, Zap } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import styles from "./Composer.module.css";

type StreamStatus = "connecting" | "idle" | "streaming" | "error";

interface ComposerProps {
  isDraft: boolean;
  research?: boolean;
  status?: ReactNode;
  changes?: ReactNode;
  queued?: ReactNode;
  modelLabel?: string;
  running: boolean;
  isLegacy: boolean;
  sending: boolean;
  streamStatus: StreamStatus;
  stopping: boolean;
  onSubmit: (text: string) => Promise<void>;
  onStop: () => Promise<void>;
}

export function Composer({ isDraft, research = false, status, changes, queued, modelLabel, running, isLegacy, sending, streamStatus, stopping, onSubmit, onStop }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const messageId = useId();
  const [feedback, setFeedback] = useState<string | null>(null);

  const streaming = streamStatus === "streaming";
  const hasDraft = Boolean(draft.trim());
  const showStop = !research && (streaming || running) && !hasDraft;
  const disabled = sending || !draft.trim();

  async function handleSubmit() {
    if (!draft.trim() || sending) return;
    const next = draft.trim();
    setDraft("");
    setFeedback(null);
    try {
      await onSubmit(next);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "发送失败，请稍后重试。");
    }
  }

  return (
    <div className={styles.dock}>
    {changes}
    {status}
    {queued}
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <label className="sr-only" htmlFor={messageId}>输入消息</label>
      <Input.TextArea
        className={styles.message}
        id={messageId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onPressEnter={(event) => {
          if (!event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void handleSubmit();
          }
        }}
        placeholder={research ? (isDraft ? "输入研究目标…" : "补充目标，重新规划…") : running ? "Agent 正在运行，消息将排入下一轮" : isDraft ? "输入后建立新对话" : "给 Yunfeng 发送消息"}
        autoSize={{ minRows: 1, maxRows: 6 }}
        disabled={sending}
        maxLength={10000}
      />
      {feedback && <p className={styles.feedback} role="alert">{feedback}</p>}
      <div className={styles.footer}>
        <span className={styles.mode}>{research ? <FlaskConical size={14} /> : <Code2 size={14} />}{research ? "科研" : "开发"}</span>
        <span className={styles.model} title={modelLabel}><Zap size={13} aria-hidden="true" /><span>{modelLabel || (research ? "项目默认模型" : "服务默认模型")}</span></span>
        {showStop ? (
          <Button
            className={styles.submit}
            type="primary"
            shape="circle"
            onClick={() => void onStop()}
            disabled={stopping}
            loading={stopping}
            icon={<Square size={11} fill="currentColor" />}
            aria-label="停止生成"
            title="停止生成"
          />
        ) : (
          <Button
            className={styles.submit}
            type="primary"
            shape="circle"
            onClick={() => void handleSubmit()}
            disabled={disabled}
            loading={sending}
            icon={<ArrowUp size={17} />}
            aria-label={isLegacy ? "发送并接入任务" : !research && running ? "发送到下一轮" : "发送消息"}
            title="发送消息"
          />
        )}
      </div>
    </form>
    </div>
  );
}
