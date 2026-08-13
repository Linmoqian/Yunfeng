import { App, Button } from "antd";
import { motion } from "motion/react";
import { Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  importLegacySession,
  resolveIntervention,
  sendTaskCommand,
  type ModelCatalog,
  type SessionSnapshot,
  type TaskState,
} from "../../services/taskService";
import { getProjectName } from "./taskPresentation";
import { TaskDetailsDrawer } from "./TaskDetailsDrawer";
import { Composer } from "./components/Composer";
import { ConversationInfoCard } from "./components/ConversationInfoCard";
import { ConversationLog } from "./components/ConversationLog";
import { useTaskStream } from "./hooks/useTaskStream";

interface TaskFocusPanelProps {
  task?: TaskState;
  legacySession?: SessionSnapshot;
  sessions: SessionSnapshot[];
  onClose: () => void;
  onTaskUpdated: (task: TaskState) => void;
  modelCatalog?: ModelCatalog;
}

const STATUS_TEXT: Record<TaskState["status"], { label: string; tone: string }> = {
  running: { label: "Agent 正在工作", tone: "running" },
  waiting_input: { label: "等待继续", tone: "waiting" },
  waiting_approval: { label: "等待审批", tone: "attention" },
  failed: { label: "本轮运行失败", tone: "attention" },
  completed: { label: "任务已完成", tone: "completed" },
  archived: { label: "已归档", tone: "completed" },
};

const PHASE_LABELS: Record<TaskState["phase"], string> = {
  understanding: "理解需求",
  planning: "规划方案",
  implementing: "实现中",
  verifying: "验证中",
  committing: "提交中",
  done: "已完成",
  unknown: "",
};

/** 单任务聚焦面板：编排会话流、工具、审批、运行控制、配置与 Git 改动。 */
export function TaskFocusPanel({ task, legacySession, sessions, onClose, onTaskUpdated, modelCatalog }: TaskFocusPanelProps) {
  const { message } = App.useApp();
  const [sending, setSending] = useState(false);
  const [busyCommand, setBusyCommand] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showThinking, setShowThinking] = useState(() => window.localStorage.getItem("yunfeng-show-thinking") === "true");
  const conversationLogRef = useRef<HTMLDivElement>(null);

  const sessionId = task?.sessionId ?? legacySession?.id ?? "";
  const isLegacy = !task;
  const {
    activeTask,
    setLocalTask,
    conversation,
    conversationLoading,
    streamStatus,
    streamError,
    approvals,
    setMessageStatus,
    removeApproval,
    beginOptimisticSend,
  } = useTaskStream({
    task,
    legacySession,
    isLegacy,
    sessionId,
    onTaskUpdated,
  });

  const statusInfo = activeTask ? STATUS_TEXT[activeTask.status] : null;
  const currentTitle = activeTask?.title ?? (legacySession?.name?.trim() || legacySession?.firstMessage || "当前对话");
  const projectName = activeTask ? getProjectName(activeTask.cwd) : getProjectName(legacySession?.cwd);
  const running = activeTask?.status === "running" || activeTask?.status === "waiting_approval";

  // 新消息到达时，会话区自动滚到底部。
  useEffect(() => {
    const log = conversationLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [conversation]);

  useEffect(() => {
    window.localStorage.setItem("yunfeng-show-thinking", String(showThinking));
  }, [showThinking]);

  /** 旧会话首次发送：懒关联导入任务，再走领域命令。 */
  async function ensureTaskForLegacy(): Promise<TaskState> {
    const imported = await importLegacySession(sessionId);
    setLocalTask(imported);
    onTaskUpdated(imported);
    return imported;
  }

  async function handleSubmit(text: string, mode: "steer" | "followUp") {
    const next = text.trim();
    if (!next || sending || streamStatus === "streaming") return;

    const optimisticId = beginOptimisticSend(next);
    setSending(true);

    try {
      if (isLegacy) {
        const imported = await ensureTaskForLegacy();
        await sendTaskCommand(imported.id, { type: "prompt", message: next });
      } else if (activeTask) {
        const commandType = running ? mode : "prompt";
        await sendTaskCommand(activeTask.id, { type: commandType, message: next });
        setMessageStatus(optimisticId, "sent");
        message.success(running ? `已 ${commandType === "steer" ? "作为转向指令影响当前运行" : "排入下一轮"}。` : "已发送，正在等待 Agent 回复。");
      }
    } catch (error) {
      setMessageStatus(optimisticId, "failed");
      // 交由上层（Composer）展示内联错误反馈；乐观消息标记失败可重发。
      throw error;
    } finally {
      setSending(false);
    }
  }

  async function handleResend(itemId: string, text: string) {
    if (!activeTask || sending) return;
    setMessageStatus(itemId, "sending");
    try {
      const commandType = running ? "steer" : "prompt";
      await sendTaskCommand(activeTask.id, { type: commandType, message: text });
      setMessageStatus(itemId, "sent");
      message.success("已重新发送。");
    } catch (error) {
      setMessageStatus(itemId, "failed");
      message.error(error instanceof Error ? error.message : "重新发送失败。");
    }
  }

  async function handleStop() {
    if (!activeTask || busyCommand) return;
    setBusyCommand("abort");
    try {
      await sendTaskCommand(activeTask.id, { type: "abort" });
      message.success("已停止生成。");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "停止生成失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  function copyMessage(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => message.success("已复制。"),
      () => message.error("复制失败，请手动选择文本。"),
    );
  }

  async function handleFork(entryId: string) {
    if (!activeTask) return;
    setBusyCommand("fork");
    try {
      const result = (await sendTaskCommand(activeTask.id, { type: "fork", entryId })) as { newTaskId?: string; newSessionId?: string } | undefined;
      if (result?.newTaskId) {
        message.success("已创建分支任务。");
        onTaskUpdated({ ...activeTask, id: result.newTaskId, sessionId: result.newSessionId ?? activeTask.sessionId, title: `分支：${activeTask.title}` } as TaskState);
      } else {
        message.success("分支创建为当前会话。");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "分支失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  async function handleApproval(requestId: string, decision: "approve" | "reject", value?: string) {
    if (!activeTask) return;
    setBusyCommand(`approval-${requestId}`);
    try {
      await resolveIntervention(activeTask.id, requestId, decision, value);
      removeApproval(requestId);
      message.success(decision === "approve" ? "已允许该操作。" : "已拒绝该操作。");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "审批提交失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  return (
    <motion.section
      key="focus"
      className="focus-panel focus-panel--inline"
      role="region"
      aria-label="当前任务"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="focus-panel__body">
        <header className="focus-panel__header">
          <div className="focus-panel__task-meta">
            <span className="focus-panel__project">{projectName}</span>
            {statusInfo ? (
              <span className={`focus-panel__status focus-panel__status--${statusInfo.tone}`}>
                {statusInfo.label}
                {activeTask?.phase && activeTask.phase !== "unknown" ? ` · ${PHASE_LABELS[activeTask.phase]}` : ""}
                {activeTask?.attentionReason ? ` · ${activeTask.attentionReason}` : ""}
              </span>
            ) : (
              <span className="focus-panel__status focus-panel__status--legacy">旧会话 · 首次发送消息后接入任务</span>
            )}
          </div>
          <div className="focus-panel__header-actions">
            {activeTask ? (
              <Button
                type="text"
                className="focus-panel__details-button"
                onClick={() => setDetailsOpen(true)}
                icon={<Settings2 size={16} />}
              >
                任务详情
              </Button>
            ) : null}
            <Button type="text" className="icon-button-slim" onClick={onClose} aria-label="关闭任务" icon={<X size={18} />} />
          </div>
        </header>

        <section className="conversation-section" aria-label="对话">
          <ConversationLog
            ref={conversationLogRef}
            items={conversation}
            loading={conversationLoading}
            streamStatus={streamStatus}
            approvals={approvals}
            streamError={streamError}
            busyCommand={busyCommand}
            hasTask={Boolean(activeTask)}
            showThinking={showThinking}
            onCopy={copyMessage}
            onFork={(entryId) => void handleFork(entryId)}
            onResend={(itemId, text) => void handleResend(itemId, text)}
            onApproval={(requestId, decision, value) => void handleApproval(requestId, decision, value)}
          />
        </section>

        <Composer
          running={running}
          isLegacy={isLegacy}
          sending={sending}
          streamStatus={streamStatus}
          stopping={busyCommand === "abort"}
          onSubmit={(text, mode) => handleSubmit(text, mode)}
          onStop={() => handleStop()}
        />
      </div>
      <ConversationInfoCard
        sessionId={sessionId}
        currentTitle={currentTitle}
        sessions={sessions}
        task={activeTask}
        modelCatalog={modelCatalog}
        refreshKey={streamStatus}
        showThinking={showThinking}
        onShowThinkingChange={setShowThinking}
        onTaskUpdated={onTaskUpdated}
      />
      {activeTask ? (
        <TaskDetailsDrawer
          open={detailsOpen}
          task={activeTask}
          modelCatalog={modelCatalog}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
    </motion.section>
  );
}
