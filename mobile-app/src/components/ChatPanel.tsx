import { useEffect, useRef } from "react";
import { Menu, MoreHorizontal, RotateCcw, Sparkles, Wrench } from "lucide-react";
import type { UseTaskResult } from "@/hooks/useTask";
import type { UseModelsResult } from "@/hooks/useModels";
import { MessageRow } from "./MessageRow";
import { Composer } from "./Composer";
import { ModelMenu } from "./ModelMenu";
import { ApprovalCard } from "./ApprovalCard";
import { Button } from "./ui/button";

interface ChatPanelProps {
  task: UseTaskResult;
  models: UseModelsResult;
  online: boolean | null;
  onOpenTasks: () => void;
  onOpenTaskActions: () => void;
}

const QUICK_PROMPTS = [
  { label: "继续执行", text: "继续执行当前任务" },
  { label: "汇报进度", text: "简要汇报当前任务的进度" },
];

function statusText(task: UseTaskResult["task"]): string {
  if (task === null) return "未选择任务";
  if (task.status === "running") return task.currentAction || "运行中";
  if (task.status === "waiting_approval") return "等待审批";
  return task.phase && task.phase !== "unknown" ? task.phase : "就绪";
}

function streamLabel(task: UseTaskResult, online: boolean | null): string {
  if (online === false) return "已断开，重连中…";
  if (task.streamStatus === "connecting") return "正在连接 Agent…";
  if (task.streamStatus === "streaming") return "Agent 正在执行";
  return "";
}

/** 主区：任务标题 + 工具/审批卡 + 对话流 + 输入条。 */
export function ChatPanel({ task, models, online, onOpenTasks, onOpenTaskActions }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [task.messages, task.streamingMessage]);

  const currentModel = models.findModel(task.task?.model?.provider, task.task?.model?.modelId);
  const allMessages = task.streamingMessage
    ? [...task.messages, task.streamingMessage]
    : task.messages;
  const hasTask = task.task !== null;
  const isBusy = task.isStreaming || task.runningTools.length > 0;
  const connecting = streamLabel(task, online);

  return (
    <>
      <div className="chat-header" data-tauri-drag-region>
        <div className="chat-header-inner">
          <button type="button" className="chat-menu-button" title="任务列表" onClick={onOpenTasks}>
            <Menu size={18} />
          </button>
          <div className="chat-title">
            <strong>{task.task?.title || (hasTask ? "当前任务" : "Yunfeng")}</strong>
            <span>
              {hasTask && <span className={`chat-status-dot${isBusy ? " is-busy" : ""}`} />}
              {isBusy
                ? task.runningTools.map((t) => t.name).join(", ") || "思考中…"
                : connecting || (currentModel ? currentModel.name : statusText(task.task))}
            </span>
          </div>
          <ModelMenu
            options={models.options}
            currentModel={currentModel}
            disabled={hasTask === false}
            onSelect={task.setModel}
          />
          <button
            type="button"
            className="icon-button chat-more-button"
            title="任务操作"
            disabled={hasTask === false}
            onClick={onOpenTaskActions}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {task.error && (
        <div className="task-error-banner">
          <span>{task.error}</span>
          {task.task?.status === "failed" && (
            <Button size="sm" variant="outline" onClick={() => void task.retry()}>
              <RotateCcw size={13} />
              重试
            </Button>
          )}
        </div>
      )}

      {task.runningTools.length > 0 && (
        <div className="tool-activity">
          {task.runningTools.map((tool) => (
            <span key={tool.id} className="tool-chip">
              <Wrench size={12} />
              {tool.name}
            </span>
          ))}
        </div>
      )}

      {task.approvals.length > 0 && (
        <div className="approval-stack">
          {task.approvals.map((approval) => (
            <ApprovalCard
              key={approval.requestId}
              approval={approval}
              onResolve={(requestId, decision, value) =>
                void task.resolveApproval(requestId, decision, value)
              }
            />
          ))}
        </div>
      )}

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
                  disabled={hasTask === false}
                  onClick={() => void task.sendPrompt(p.text)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          allMessages.map((m) => (
            <MessageRow
              key={m.id ?? `${m.role}-${String(m.timestamp)}`}
              message={m}
              streaming={task.streamingMessage === m}
            />
          ))
        )}
      </div>

      <Composer
        disabled={hasTask === false}
        isStreaming={task.isStreaming}
        onSend={task.sendPrompt}
        onAbort={task.abort}
      />
    </>
  );
}
