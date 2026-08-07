import { Button, Input } from "antd";
import { CircleStop, Send } from "lucide-react";
import { useState } from "react";

type StreamStatus = "connecting" | "idle" | "streaming" | "error";

interface ComposerProps {
  running: boolean;
  isLegacy: boolean;
  sending: boolean;
  streamStatus: StreamStatus;
  stopping: boolean;
  onSubmit: (text: string, mode: "steer" | "followUp") => Promise<void>;
  onStop: () => Promise<void>;
}

export function Composer({ running, isLegacy, sending, streamStatus, stopping, onSubmit, onStop }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nextActionMode, setNextActionMode] = useState<"steer" | "followUp">("steer");

  const streaming = streamStatus === "streaming";
  const hasDraft = Boolean(draft.trim());
  const showStop = streaming || (running && !hasDraft);
  const disabled = sending || streaming || !draft.trim();

  async function handleSubmit() {
    if (!draft.trim() || sending || streamStatus === "streaming") return;
    const next = draft.trim();
    setDraft("");
    setFeedback(null);
    try {
      await onSubmit(next, nextActionMode);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "发送失败，请稍后重试。");
    }
  }

  return (
    <form
      className="focus-panel__composer"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <label className="sr-only" htmlFor="task-message">输入消息</label>
      <Input.TextArea
        id="task-message"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onPressEnter={(event) => {
          if (!event.shiftKey) {
            event.preventDefault();
            void handleSubmit();
          }
        }}
        placeholder={running ? "Agent 正在运行，可停止后继续输入" : "给 Yunfeng 发送消息"}
        autoSize={{ minRows: 1, maxRows: 6 }}
        disabled={sending}
        maxLength={10000}
      />
      {running && hasDraft ? (
        <div className="focus-panel__mode-switch" role="group" aria-label="下一轮处理方式">
          <span className="focus-panel__mode-label">运行中发送为</span>
          <Button
            size="small"
            type={nextActionMode === "steer" ? "primary" : "text"}
            onClick={() => setNextActionMode("steer")}
            aria-pressed={nextActionMode === "steer"}
          >
            steer 影响当前运行
          </Button>
          <Button
            size="small"
            type={nextActionMode === "followUp" ? "primary" : "text"}
            onClick={() => setNextActionMode("followUp")}
            aria-pressed={nextActionMode === "followUp"}
          >
            下一轮处理
          </Button>
        </div>
      ) : null}
      <div className="focus-panel__composer-footer">
        {feedback ? (
          <span className="focus-panel__composer-feedback" role={feedback.includes("失败") ? "alert" : "status"}>
            {feedback}
          </span>
        ) : null}
        {showStop ? (
          <Button
            className="focus-panel__composer-submit"
            type="primary"
            shape="circle"
            onClick={() => void onStop()}
            disabled={stopping}
            loading={stopping}
            icon={<CircleStop size={17} />}
            aria-label="停止生成"
            title="停止生成"
          />
        ) : (
          <Button
            className="focus-panel__composer-submit"
            type="primary"
            shape="circle"
            onClick={() => void handleSubmit()}
            disabled={disabled}
            loading={sending}
            icon={<Send size={16} />}
            aria-label={isLegacy ? "发送并接入任务" : running ? (nextActionMode === "steer" ? "转向" : "发送到下一轮") : "发送消息"}
            title="发送消息"
          />
        )}
      </div>
    </form>
  );
}
