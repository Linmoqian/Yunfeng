import { Button, Input } from "antd";
import { Send } from "lucide-react";
import { useState } from "react";

type StreamStatus = "connecting" | "idle" | "streaming" | "error";

interface ComposerProps {
  running: boolean;
  isLegacy: boolean;
  sending: boolean;
  streamStatus: StreamStatus;
  onSubmit: (text: string, mode: "steer" | "followUp") => Promise<void>;
}

export function Composer({ running, isLegacy, sending, streamStatus, onSubmit }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nextActionMode, setNextActionMode] = useState<"steer" | "followUp">("steer");

  const disabled = sending || streamStatus === "streaming" || !draft.trim();

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
      <label htmlFor="task-message">输入消息</label>
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
        placeholder={running ? "Agent 正在运行，将作为下一条指令" : "输入消息，按 Enter 发送；Shift + Enter 换行"}
        rows={3}
        disabled={sending}
        maxLength={10000}
      />
      {running ? (
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
        <Button
          type="primary"
          onClick={() => void handleSubmit()}
          disabled={disabled}
          loading={sending}
          icon={<Send size={15} />}
        >
          {sending ? "正在发送" : isLegacy ? "发送并接入任务" : running ? (nextActionMode === "steer" ? "转向" : "发送到下一轮") : "发送"}
        </Button>
      </div>
    </form>
  );
}
