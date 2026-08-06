import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  importLegacySession,
  loadTaskConversation,
  sendTaskCommand,
  subscribeTaskEvents,
  type SessionSnapshot,
  type TaskState,
  type TaskStreamEvent,
} from "../../services/taskService";
import { getProjectName } from "./taskPresentation";

interface TaskFocusPanelProps {
  task?: TaskState;
  legacySession?: SessionSnapshot;
  onClose: () => void;
  onTaskUpdated: (task: TaskState) => void;
}

const STREAMING_MESSAGE_ID = "__streaming_assistant__";

type ConversationRole = "user" | "assistant" | "tool";
type MessageStatus = "sending" | "sent" | "failed" | undefined;

interface ConversationItem {
  id: string;
  role: ConversationRole;
  text: string;
  streaming?: boolean;
  status?: MessageStatus;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const candidate = block as { type?: string; text?: string; thinking?: string; content?: unknown };
      if (candidate.type === "text" && typeof candidate.text === "string") return candidate.text;
      if (candidate.type === "thinking") return "";
      return typeof candidate.content === "string" ? candidate.content : "";
    }).filter(Boolean).join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function normalizeConversationMessage(message: unknown, index: number): ConversationItem | null {
  const candidate = message as { id?: string; role?: string; content?: unknown };
  const text = contentToText(candidate.content).trim();
  if (!text) return null;
  const role: ConversationRole = candidate.role === "user" ? "user" : candidate.role === "assistant" ? "assistant" : "tool";
  return {
    id: candidate.id ?? `${role}-${index}`,
    role,
    text,
  };
}

function mergeConversation(current: ConversationItem[], loaded: ConversationItem[]): ConversationItem[] {
  const loadedIds = new Set(loaded.map((message) => message.id));
  return [...loaded, ...current.filter((message) => message.id === STREAMING_MESSAGE_ID || !loadedIds.has(message.id))];
}

function getTextDelta(event: TaskStreamEvent): string | null {
  if (event.type !== "message_delta") return null;
  const data = event.data as { delta?: unknown } | undefined;
  return data && typeof data.delta === "string" ? data.delta : null;
}

function ConversationMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

const STATUS_TEXT: Record<TaskState["status"], { label: string; tone: string }> = {
  running: { label: "Agent 正在工作", tone: "running" },
  waiting_input: { label: "等待继续", tone: "waiting" },
  waiting_approval: { label: "等待审批", tone: "attention" },
  failed: { label: "本轮运行失败", tone: "attention" },
  completed: { label: "任务已完成", tone: "completed" },
  archived: { label: "已归档", tone: "completed" },
};

export function TaskFocusPanel({ task, legacySession, onClose, onTaskUpdated }: TaskFocusPanelProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "idle" | "streaming" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [localTask, setLocalTask] = useState<TaskState | null>(task ?? null);
  const conversationLogRef = useRef<HTMLDivElement>(null);

  // 任务对象：优先真实任务，legacy 会话在首次操作后接入任务
  const activeTask = task ?? localTask;
  const sessionId = activeTask?.sessionId ?? legacySession?.id ?? "";
  const isLegacy = !activeTask && Boolean(legacySession);
  const statusInfo = activeTask ? STATUS_TEXT[activeTask.status] : null;

  const title = activeTask?.title ?? legacySession?.name?.trim() ?? legacySession?.firstMessage ?? "旧会话";
  const projectName = activeTask ? getProjectName(activeTask.cwd) : getProjectName(legacySession?.cwd);

  const resetForTask = useCallback(() => {
    setMessage("");
    setFeedback(null);
    setConversation([]);
    setConversationLoading(true);
    setStreamStatus("connecting");
    setStreamError(null);
    setToolActivity(null);
  }, []);

  useEffect(() => {
    resetForTask();
    const controller = new AbortController();

    if (isLegacy) {
      // 旧会话：只读浏览，不启动事件流
      void loadTaskConversation(sessionId, controller.signal)
        .then((messages) => {
          const loaded = messages.map(normalizeConversationMessage).filter((item): item is ConversationItem => item !== null);
          setConversation((current) => mergeConversation(current, loaded));
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setStreamError(error instanceof Error ? error.message : "会话记录暂时无法读取");
          setStreamStatus("error");
        })
        .finally(() => setConversationLoading(false));
      return () => controller.abort();
    }

    if (!activeTask) return () => controller.abort();
    const taskId = activeTask.id;
    const unsubscribe = subscribeTaskEvents(taskId, (event) => {
      if (event.type === "task_updated") {
        const data = event.data as Partial<TaskState> | undefined;
        if (data && typeof data.status === "string") {
          setLocalTask((current) => ({ ...(current ?? activeTask), ...data }) as TaskState);
        }
        return;
      }

      const delta = getTextDelta(event);
      if (delta) {
        setStreamStatus("streaming");
        setConversation((current) => {
          const streaming = current.find((item) => item.id === STREAMING_MESSAGE_ID);
          if (streaming) {
            return current.map((item) => item.id === STREAMING_MESSAGE_ID ? { ...item, text: item.text + delta } : item);
          }
          return [...current, { id: STREAMING_MESSAGE_ID, role: "assistant", text: delta, streaming: true }];
        });
      }

      if (event.type === "tool_started") {
        const data = event.data as { name?: string } | undefined;
        setStreamStatus("streaming");
        setToolActivity(`正在运行 ${typeof data?.name === "string" ? data.name : "工具"}`);
      }
      if (event.type === "tool_finished") setToolActivity(null);
      if (event.type === "run_failed") {
        setStreamStatus("error");
        const data = event.data as { action?: string } | undefined;
        setStreamError(data?.action ?? "Agent 执行失败");
        setToolActivity(null);
      }
      if (event.type === "run_settled" || event.type === "message_completed") {
        setStreamStatus("idle");
        setToolActivity(null);
        setConversation((current) => current.map((item) => (
          item.id === STREAMING_MESSAGE_ID ? { ...item, id: `assistant-${Date.now()}`, streaming: false } : item
        )));
      }
    }, (connected) => {
      if (!connected) setStreamStatus("connecting");
    });

    void loadTaskConversation(taskId, controller.signal)
      .then((messages) => {
        const loaded = messages.map(normalizeConversationMessage).filter((item): item is ConversationItem => item !== null);
        setConversation((current) => mergeConversation(current, loaded));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStreamError(error instanceof Error ? error.message : "会话记录暂时无法读取");
        setStreamStatus("error");
      })
      .finally(() => setConversationLoading(false));

    return () => {
      controller.abort();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isLegacy]);

  useEffect(() => {
    const log = conversationLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [conversation, toolActivity]);

  // localTask 变化时上报父级；用微任务避开渲染期间 setState 父组件的问题。
  const prevTaskRef = useRef<TaskState | null | undefined>(task);
  prevTaskRef.current = task;
  useEffect(() => {
    if (!localTask) return;
    const prevFromProps = prevTaskRef.current;
    // 若与父级传入的任务一致，或不是由本地事件产生的变更，避免重复上报
    if (prevFromProps && prevFromProps.id === localTask.id && prevFromProps.status === localTask.status) {
      return;
    }
    queueMicrotask(() => onTaskUpdated(localTask));
  }, [localTask]);

  const running = activeTask?.status === "running" || activeTask?.status === "waiting_approval";
  const completed = activeTask?.status === "completed";
  // 任务运行中时的下一轮处理方式：默认 steer（影响当前运行），可切换 followUp（当前轮结束后执行）
  const [nextActionMode, setNextActionMode] = useState<"steer" | "followUp">("steer");
  const [queueStatus, setQueueStatus] = useState<string | null>(null);

  /** 旧会话首次发送：懒关联导入任务，再走领域命令。 */
  async function ensureTaskForLegacy(): Promise<TaskState> {
    const imported = await importLegacySession(sessionId);
    setLocalTask(imported);
    onTaskUpdated(imported);
    return imported;
  }

  function getCommandForSend(): "prompt" | "steer" | "followUp" {
    if (running) return nextActionMode;
    return "prompt";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || sending || streamStatus === "streaming") return;

    const nextMessage = message.trim();
    const optimisticId = `user-${Date.now()}`;
    setSending(true);
    setFeedback(null);
    setStreamError(null);
    setConversation((current) => [...current, { id: optimisticId, role: "user", text: nextMessage, status: "sending" }]);

    try {
      if (isLegacy) {
        const imported = await ensureTaskForLegacy();
        await sendTaskCommand(imported.id, { type: "prompt", message: nextMessage });
      } else if (activeTask) {
        const commandType = getCommandForSend();
        await sendTaskCommand(activeTask.id, { type: commandType, message: nextMessage });
        // 乐观消息发送成功
        setConversation((current) => current.map((item) => item.id === optimisticId ? { ...item, status: "sent" } : item));
        setFeedback(running ? `已 ${commandType === "steer" ? "作为转向指令影响当前运行" : "排入下一轮"}。` : "已发送，正在等待 Agent 回复。");
      }
      setMessage("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "发送失败，请稍后重试。");
      setConversation((current) => current.map((item) => item.id === optimisticId ? { ...item, status: "failed" } : item));
    } finally {
      setSending(false);
    }
  }

  /** 失败消息重发：不伪装为成功，保留失败状态直到真正发送。 */
  async function handleResend(itemId: string, text: string) {
    if (!activeTask || sending) return;
    setConversation((current) => current.map((item) => item.id === itemId ? { ...item, status: "sending" } : item));
    try {
      const commandType = getCommandForSend();
      await sendTaskCommand(activeTask.id, { type: commandType, message: text });
      setConversation((current) => current.map((item) => item.id === itemId ? { ...item, status: "sent" } : item));
      setFeedback("已重新发送。");
    } catch (error) {
      setConversation((current) => current.map((item) => item.id === itemId ? { ...item, status: "failed" } : item));
      setFeedback(error instanceof Error ? error.message : "重新发送失败。");
    }
  }

  function copyMessage(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => setFeedback("已复制。"),
      () => setFeedback("复制失败，请手动选择文本。"),
    );
  }

  async function handleFork(entryId: string) {
    if (!activeTask) return;
    setBusyCommand("fork");
    try {
      const result = (await sendTaskCommand(activeTask.id, { type: "fork", entryId })) as { newTaskId?: string; newSessionId?: string } | undefined;
      if (result?.newTaskId) {
        setFeedback("已创建分支任务。");
        onTaskUpdated({ ...activeTask, id: result.newTaskId, sessionId: result.newSessionId ?? activeTask.sessionId, title: `分支：${activeTask.title}` } as TaskState);
      } else {
        setFeedback("分支创建为当前会话。");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "分支失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  async function handleClearQueue() {
    if (!activeTask) return;
    setBusyCommand("clearQueue");
    try {
      const queue = (await sendTaskCommand(activeTask.id, { type: "clearQueue" })) as { steering?: unknown[]; followUp?: unknown[] } | undefined;
      setQueueStatus(queue && queue.steering?.length === 0 && queue.followUp?.length === 0
        ? "队列已清空"
        : "队列已清空");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "清空队列失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  async function handleAbort() {
    if (!activeTask || !running) return;
    setBusyCommand("abort");
    try {
      await sendTaskCommand(activeTask.id, { type: "abort" });
      setFeedback("已请求中止当前运行。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "中止失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  async function handleRetry() {
    if (!activeTask) return;
    setBusyCommand("retry");
    try {
      await sendTaskCommand(activeTask.id, { type: "retry" });
      setFeedback("已重置为等待继续，可重新发送目标。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "重试失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  async function handleComplete() {
    if (!activeTask || completed) return;
    setBusyCommand("complete");
    try {
      await sendTaskCommand(activeTask.id, { type: "complete" });
      setFeedback("任务已标记完成。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "完成失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  const [busyCommand, setBusyCommand] = useState<string | null>(null);

  const sendDisabled = sending || streamStatus === "streaming" || !message.trim();

  return (
    <section className="focus-panel focus-panel--inline" role="region" aria-label="当前任务">
      <div className="focus-panel__body">
        <header className="focus-panel__header">
          <div>
            <p className="eyebrow">{projectName}</p>
            <h2 id="focus-panel-title">{title}</h2>
            {statusInfo ? (
              <p className={`focus-panel__status focus-panel__status--${statusInfo.tone}`}>
                {statusInfo.label}
                {activeTask?.phase && activeTask.phase !== "unknown" ? ` · ${PHASE_LABELS[activeTask.phase]}` : ""}
                {activeTask?.attentionReason ? ` · ${activeTask.attentionReason}` : ""}
              </p>
            ) : (
              <p className="focus-panel__status focus-panel__status--legacy">旧会话 · 首次发送消息后接入任务</p>
            )}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭任务">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section className="conversation-section" aria-labelledby="conversation-title">
          <div className="focus-panel__section-heading">
            <h3 id="conversation-title">对话</h3>
            <span>{streamStatus === "streaming" ? "Agent 正在回复" : streamStatus === "connecting" ? "正在连接" : "实时同步"}</span>
          </div>
          <div ref={conversationLogRef} className="conversation-log" role="log" aria-label="任务对话" aria-live="polite">
            {conversationLoading ? <p className="conversation-placeholder">正在读取会话记录…</p> : null}
            {!conversationLoading && conversation.length === 0 ? <p className="conversation-placeholder">这段会话还没有可展示的消息。</p> : null}
            {conversation.map((item) => (
              <article key={item.id} className={`conversation-message conversation-message--${item.role} ${item.streaming ? "conversation-message--streaming" : ""} ${item.status === "failed" ? "conversation-message--failed" : ""}`.trim()}>
                <span className="conversation-message__role">
                  {item.role === "user" ? "你" : item.role === "assistant" ? "Agent" : "工具"}
                  {item.status ? <span className={`message-dot message-dot--${item.status}`} aria-label={item.status === "failed" ? "发送失败" : item.status === "sending" ? "发送中" : "已发送"} /> : null}
                </span>
                <div className="conversation-message__content">
                  <ConversationMarkdown text={item.text} />
                </div>
                <div className="conversation-message__actions">
                  <button type="button" className="text-button" onClick={() => copyMessage(item.text)}>复制</button>
                  {item.role === "assistant" && activeTask ? (
                    <button type="button" className="text-button" onClick={() => void handleFork(item.id)}>从此分支</button>
                  ) : null}
                  {item.role === "user" && item.status === "failed" ? (
                    <button type="button" className="text-button" onClick={() => void handleResend(item.id, item.text)}>重新发送</button>
                  ) : null}
                </div>
              </article>
            ))}
            {toolActivity ? <p className="conversation-tool-status" role="status">{toolActivity}</p> : null}
            {streamError ? <p className="conversation-error" role="alert">{streamError}</p> : null}
          </div>
        </section>

        {activeTask ? (
          <div className="focus-panel__run-controls">
            {running ? (
              <button className="text-button" type="button" onClick={() => void handleAbort()} disabled={busyCommand !== null}>
                中止运行
              </button>
            ) : null}
            {running ? (
              <button className="text-button" type="button" onClick={() => void handleClearQueue()} disabled={busyCommand !== null}>
                清空排队
              </button>
            ) : null}
            {!running && !completed ? (
              <button className="text-button" type="button" onClick={() => void handleRetry()} disabled={busyCommand !== null}>
                重试本轮
              </button>
            ) : null}
            {!completed ? (
              <button className="text-button" type="button" onClick={() => void handleComplete()} disabled={busyCommand !== null}>
                标记完成
              </button>
            ) : null}
            {queueStatus ? <span className="focus-panel__queue-status">{queueStatus}</span> : null}
          </div>
        ) : null}

        <form className="focus-panel__composer" onSubmit={handleSubmit}>
          <label htmlFor="task-message">输入消息</label>
          <textarea
            id="task-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={running ? "Agent 正在运行，将作为下一条指令" : "输入消息，按 Enter 发送；Shift + Enter 换行"}
            rows={3}
            disabled={sending}
          />
          {running ? (
            <div className="focus-panel__mode-switch" role="group" aria-label="下一轮处理方式">
              <span className="focus-panel__mode-label">运行中发送为</span>
              <button
                type="button"
                className={`mode-chip${nextActionMode === "steer" ? " mode-chip--active" : ""}`}
                onClick={() => setNextActionMode("steer")}
                aria-pressed={nextActionMode === "steer"}
              >
                steer 影响当前运行
              </button>
              <button
                type="button"
                className={`mode-chip${nextActionMode === "followUp" ? " mode-chip--active" : ""}`}
                onClick={() => setNextActionMode("followUp")}
                aria-pressed={nextActionMode === "followUp"}
              >
                下一轮处理
              </button>
            </div>
          ) : null}
          <div className="focus-panel__composer-footer">
            <span role={feedback && feedback.includes("失败") ? "alert" : "status"}>{feedback}</span>
            <button className="button button--primary" type="submit" disabled={sendDisabled}>
              {sending ? "正在发送" : isLegacy ? "发送并接入任务" : running ? (nextActionMode === "steer" ? "转向" : "发送到下一轮") : "发送"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

const PHASE_LABELS: Record<TaskState["phase"], string> = {
  understanding: "理解需求",
  planning: "规划方案",
  implementing: "实现中",
  verifying: "验证中",
  committing: "提交中",
  done: "已完成",
  unknown: "",
};
