import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { UseTaskResult } from "@/hooks/useTask";
import type { UseModelsResult } from "@/hooks/useModels";
import { MessageRow } from "./MessageRow";
import { Composer } from "./Composer";
import { ModelMenu } from "./ModelMenu";

interface ChatPanelProps {
  task: UseTaskResult;
  models: UseModelsResult;
}

const QUICK_PROMPTS = [
  { label: "继续执行", text: "继续执行当前任务" },
  { label: "汇报进度", text: "简要汇报当前任务的进度" },
];

function statusText(task: UseTaskResult["task"]): string {
  if (!task) return "未选择任务";
  if (task.status === "running") return task.currentAction || "运行中";
  if (task.status === "waiting_approval") return "等待审批";
  return task.phase && task.phase !== "unknown" ? task.phase : "就绪";
}

/** 主区：任务标题 + 对话流 + 输入条。 */
export function ChatPanel({ task, models }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [task.messages, task.streamingMessage]);

  const currentModel = models.findModel(task.task?.model?.provider, task.task?.model?.modelId);
  const allMessages = task.streamingMessage
    ? [...task.messages, task.streamingMessage]
    : task.messages;
  const hasTask = Boolean(task.task);
  const isBusy = task.isStreaming || task.runningTools.length > 0;

  return (
    <>
      <div className="chat-header" data-tauri-drag-region>
        <div className="chat-header-inner">
          <div className="chat-title">
            <strong>{task.task?.title || (hasTask ? "当前任务" : "Yunfeng")}</strong>
            <span>
              {hasTask && <span className={`chat-status-dot${isBusy ? " is-busy" : ""}`} />}
              {isBusy
                ? task.runningTools.map((t) => t.name).join(", ") || "思考中…"
                : currentModel
                  ? currentModel.name
                  : statusText(task.task)}
            </span>
          </div>
          <ModelMenu
            options={models.options}
            currentModel={currentModel}
            disabled={!hasTask}
            onSelect={task.setModel}
          />
        </div>
      </div>

      {task.notice && <div className="task-notice">{task.notice}</div>}

      <div ref={scrollRef} className="message-stream">
        {allMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Sparkles size={22} />
            </div>
            <h2>Yunfeng 编码助手</h2>
            <p>选择左侧任务查看对话，或直接向电脑中的 Agent 发送指令。</p>
            <div className="quick-prompts">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  type="button"
                  className="quick-prompt"
                  disabled={!hasTask}
                  onClick={() => void task.sendPrompt(p.text)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          allMessages.map((m) => (
            <MessageRow key={m.id ?? `${m.role}-${String(m.timestamp)}`} message={m} streaming={task.streamingMessage === m} />
          ))
        )}
      </div>

      <Composer
        disabled={!hasTask}
        isStreaming={task.isStreaming}
        onSend={task.sendPrompt}
        onAbort={task.abort}
      />
    </>
  );
}
