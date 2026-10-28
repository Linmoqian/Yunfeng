// 会话聚焦编排，科研展示由独立 Runtime 卡片承载。
// Created on 2026-10-18
// @author: https://github.com/Linmoqian
import { App } from "antd";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  createConversation,
  importLegacySession,
  resolveIntervention,
  sendTaskCommand,
  type ModelCatalog,
  type ModelSelection,
  type SessionSnapshot,
  type TaskState,
} from "../../services/taskService";
import { Composer } from "./components/Composer";
import { ChangeSummary } from "./components/ChangeSummary";
import { QueuedMessages } from "./components/QueuedMessages";
import { ConversationWelcome } from "./components/ConversationWelcome";
import { ResearchActivity } from "./components/ResearchActivity";
import { ResearchRuntimeCard } from "./components/ResearchRuntimeCard";
import { ResearchGraph } from "./components/ResearchGraph";
import { researchConversation } from "./researchPresentation";
import { SESSION_ENTER } from "./workspaceMotion";
import { ConversationInfoCard } from "./components/ConversationInfoCard";
import { ConversationLog } from "./components/ConversationLog";
import { useTaskStream } from "./hooks/useTaskStream";

interface TaskFocusPanelProps {
  draft?: boolean;
  task?: TaskState;
  legacySession?: SessionSnapshot;
  sessions: SessionSnapshot[];
  onTaskUpdated: (task: TaskState) => void;
  onTaskCreated?: (task: TaskState, firstMessage: string) => void;
  initialMessage?: string;
  modelCatalog?: ModelCatalog;
  modelSelection?: ModelSelection | null;
  infoContainer?: HTMLElement | null;
  showInfo?: boolean;
}

/** 单任务聚焦面板：编排会话流、工具、审批、运行控制、配置与 Git 改动。 */
export function TaskFocusPanel({ draft = false, task, legacySession, sessions, onTaskUpdated, onTaskCreated, initialMessage, modelCatalog, modelSelection, infoContainer, showInfo = true }: TaskFocusPanelProps) {
  const { message } = App.useApp();
  const reduced = useReducedMotion();
  const [sending, setSending] = useState(false);
  const [workMode, setWorkMode] = useState<"development" | "research">("development");
  const [graphTaskId, setGraphTaskId] = useState<string | null>(null);
  const [busyCommand, setBusyCommand] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState(() => window.localStorage.getItem("yunfeng-show-thinking") === "true");
  const conversationLogRef = useRef<HTMLDivElement>(null);

  const sessionId = task?.sessionId ?? legacySession?.id ?? "";
  const isLegacy = !draft && !task;
  const {
    activeTask,
    setLocalTask,
    conversation,
    conversationLoading,
    streamStatus,
    streamError,
    toolCalls,
    approvals,
    queueRevision,
    changesRevision,
    setMessageStatus,
    removeApproval,
    beginOptimisticSend,
  } = useTaskStream({
    task,
    legacySession,
    isDraft: draft,
    isLegacy,
    initialMessage,
    sessionId,
    onTaskUpdated,
  });

  const currentTitle = activeTask?.title ?? (legacySession?.name?.trim() || legacySession?.firstMessage || "新对话");
  const composerModel = activeTask?.model ?? (draft ? modelSelection : null);
  const composerModelLabel = composerModel ? modelCatalog?.models.find((item) => item.id === composerModel.modelId && item.provider === composerModel.provider)?.name ?? composerModel.modelId : undefined;
  const running = activeTask?.status === "running" || activeTask?.status === "waiting_approval";

  // 新消息到达时，会话区自动滚到底部。
  useEffect(() => {
    const log = conversationLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [conversation, toolCalls, graphTaskId]);

  // 阶段卡出现时跟随底部；工程师已向上阅读时保留其滚动位置，计时跳秒不触发滚动。
  useEffect(() => {
    const log = conversationLogRef.current;
    if (activeTask?.autonomy && log && log.scrollHeight - log.scrollTop - log.clientHeight < 260) log.scrollTop = log.scrollHeight;
  }, [activeTask?.autonomy?.phase, activeTask?.autonomy?.trigger?.receivedAt]);

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

  async function handleSubmit(text: string) {
    const next = text.trim();
    if (!next || sending) return;

    const optimisticId = beginOptimisticSend(next);
    setSending(true);

    try {
      if (draft) {
        const { task: createdTask } = await createConversation(modelSelection, next, { mode: workMode });
        setLocalTask(createdTask);
        setMessageStatus(optimisticId, "sent");
        onTaskUpdated(createdTask);
        onTaskCreated?.(createdTask, next);
      } else if (isLegacy) {
        const imported = await ensureTaskForLegacy();
        await sendTaskCommand(imported.id, { type: "prompt", message: next });
        setMessageStatus(optimisticId, "sent");
        onTaskCreated?.(imported, next);
      } else if (activeTask) {
        // 科研指令统一更新目标并重新观察；不提供与后端行为不一致的排队选项。
        const commandType = activeTask.mode === "research" ? "prompt" : running ? "followUp" : "prompt";
        await sendTaskCommand(activeTask.id, { type: commandType, message: next });
        setMessageStatus(optimisticId, "sent");
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
      const commandType = activeTask.mode === "research" ? "prompt" : running ? "followUp" : "prompt";
      await sendTaskCommand(activeTask.id, { type: commandType, message: text });
      setMessageStatus(itemId, "sent");
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
      message.success(activeTask.mode === "research" ? "科研任务已暂停。" : "已停止生成。");
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
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={SESSION_ENTER}
    >
      <div className="focus-panel__body">
        <section className="conversation-section" aria-label={activeTask?.mode === "research" && graphTaskId === activeTask.id ? "研究分支" : "对话"}>
          {activeTask?.mode === "research" && graphTaskId === activeTask.id ? <ResearchGraph key={activeTask.id} task={activeTask} onClose={() => { setGraphTaskId(null); document.getElementById(`research-graph-${activeTask.id}`)?.focus(); }} />
          : draft && !conversation.length ? <ConversationWelcome mode={workMode} onModeChange={setWorkMode} /> : <ConversationLog
            ref={conversationLogRef}
            research={activeTask?.mode === "research"}
            activity={activeTask?.mode === "research" ? <ResearchActivity key={activeTask.id} task={activeTask} /> : undefined}
            items={researchConversation(conversation, activeTask?.mode)}
            toolCalls={toolCalls}
            loading={conversationLoading}
            running={running}
            streamStatus={streamStatus}
            approvals={approvals}
            streamError={streamError}
            busyCommand={busyCommand}
            hasTask={Boolean(activeTask) && activeTask?.mode !== "research"}
            showThinking={showThinking}
            onCopy={copyMessage}
            onFork={(entryId) => void handleFork(entryId)}
            onResend={(itemId, text) => void handleResend(itemId, text)}
            onApproval={(requestId, decision, value) => void handleApproval(requestId, decision, value)}
          />}
        </section>

        <Composer
          changes={activeTask ? <ChangeSummary key={activeTask.id} taskId={activeTask.id} allowDiff={activeTask.mode !== "research"} revision={`${changesRevision}:${streamStatus}:${conversation.length}:${toolCalls.length}`} /> : undefined}
          queued={activeTask && activeTask.mode !== "research" ? <QueuedMessages key={activeTask.id} taskId={activeTask.id} revision={`${queueRevision}:${streamStatus}`} /> : undefined}
          status={activeTask?.mode === "research" ? <ResearchRuntimeCard task={activeTask} graphOpen={graphTaskId === activeTask.id} onToggleGraph={() => setGraphTaskId(graphTaskId === activeTask.id ? null : activeTask.id)} /> : undefined}
          modelLabel={composerModelLabel}
          isDraft={draft}
          research={activeTask?.mode === "research" || (draft && workMode === "research")}
          running={running}
          isLegacy={isLegacy}
          sending={sending}
          streamStatus={streamStatus}
          stopping={busyCommand === "abort"}
          onSubmit={handleSubmit}
          onStop={() => handleStop()}
        />
      </div>
      {!draft && activeTask?.mode !== "research" && showInfo && infoContainer ? createPortal(
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
      , infoContainer) : null}
    </motion.section>
  );
}
