import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  importLegacySession,
  loadTaskCapabilities,
  loadTaskConversation,
  loadTaskInterventions,
  loadTaskGit,
  loadTaskGitDiff,
  commitTaskChanges,
  requestTaskPush,
  resolveIntervention,
  sendTaskCommand,
  subscribeTaskEvents,
  type ModelCatalog,
  type SessionSnapshot,
  type TaskCapabilitiesResult,
  type TaskGitSummary,
  type TaskState,
  type TaskStreamEvent,
} from "../../services/taskService";
import { getProjectName } from "./taskPresentation";

interface TaskFocusPanelProps {
  task?: TaskState;
  legacySession?: SessionSnapshot;
  onClose: () => void;
  onTaskUpdated: (task: TaskState) => void;
  modelCatalog?: ModelCatalog;
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

interface ToolCallInfo {
  callId: string;
  name: string;
  args?: unknown;
  startedAt?: string;
  finishedAt?: string;
  isError?: boolean;
  result?: unknown;
}

interface ApprovalInfo {
  requestId: string;
  kind: "confirm" | "select" | "input";
  title: string;
  message: string;
  safeLabel?: string;
  impact?: string;
  options?: string[];
  status: "pending" | "resolved";
}

 /** 工具参数/输出摘要展示（限制长度）。 */
function formatToolOutput(value: unknown, max = 800): string {
  if (value === undefined || value === null) return "";
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
  }
  return text.length > max ? `${text.slice(0, max)}…[截断]` : text;
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

/** 工具调用卡片：名称、状态、参数摘要、折叠输出。默认折叠。 */
function ToolCallCard({ call }: { call: ToolCallInfo }) {
  const running = !call.finishedAt;
  const args = formatToolOutput(call.args, 400);
  const output = call.result !== undefined ? formatToolOutput(call.result) : "";
  const statusLabel = call.isError ? "失败" : running ? "运行中" : "完成";
  return (
    <details className={`tool-card tool-card--${call.isError ? "error" : running ? "running" : "done"}`} open={running}>
      <summary className="tool-card__summary">
        <span className="tool-card__name">{call.name}</span>
        <span className="tool-card__status">{statusLabel}</span>
      </summary>
      <div className="tool-card__body">
        {args ? (
          <pre className="tool-card__args"><code>{args}</code></pre>
        ) : null}
        {output ? (
          <pre className="tool-card__output"><code>{output}</code></pre>
        ) : <p className="tool-card__empty">该工具调用没有输出。</p>}
      </div>
    </details>
  );
}

/** 审批卡：允许一次 / 拒绝。提供 select/input 的可选输入。 */
function ApprovalCard({ approval, busy, onApprove, onReject }: {
  approval: ApprovalInfo;
  busy: boolean;
  onApprove: (value?: string) => void;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState("");
  const needsInput = approval.kind !== "confirm";
  return (
    <article className={`approval-card approval-card--${approval.kind}`}>
      <p className="approval-card__eyebrow">需要你审批 · {approval.kind === "confirm" ? "确认" : approval.kind === "select" ? "选择" : "输入"}</p>
      <h4 className="approval-card__title">{approval.title}</h4>
      {approval.message ? <p className="approval-card__message">{approval.message}</p> : null}
      {approval.safeLabel ? <p className="approval-card__impact">操作：{approval.safeLabel}</p> : null}
      {approval.impact ? <p className="approval-card__impact">影响范围：{approval.impact}</p> : null}
      {approval.kind === "select" && approval.options && approval.options.length > 0 ? (
        <select
          className="approval-card__select"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
        >
          <option value="">请选择…</option>
          {approval.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : null}
      {approval.kind === "input" ? (
        <input
          className="approval-card__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="输入内容"
          disabled={busy}
        />
      ) : null}
      <div className="approval-card__actions">
        <button className="button button--quiet" type="button" onClick={onReject} disabled={busy}>
          拒绝
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={() => onApprove(needsInput && draft ? draft : undefined)}
          disabled={busy || (needsInput && approval.kind === "select" && !draft)}
        >
          {approval.kind === "confirm" ? "允许一次" : "提交"}
        </button>
      </div>
    </article>
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

export function TaskFocusPanel({ task, legacySession, onClose, onTaskUpdated, modelCatalog }: TaskFocusPanelProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "idle" | "streaming" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [approvals, setApprovals] = useState<ApprovalInfo[]>([]);
  const [localTask, setLocalTask] = useState<TaskState | null>(task ?? null);
  const conversationLogRef = useRef<HTMLDivElement>(null);
  const [capabilities, setCapabilities] = useState<TaskCapabilitiesResult | null>(null);
  const [configBusy, setConfigBusy] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [gitState, setGitState] = useState<TaskGitSummary | null>(null);
  const [gitOpen, setGitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [diffOpenPath, setDiffOpenPath] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [gitBusy, setGitBusy] = useState(false);

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
    setToolCalls([]);
    setApprovals([]);
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
        const data = event.data as { name?: string; callId?: string; args?: unknown; startedAt?: string } | undefined;
        const callId = typeof data?.callId === "string" ? data.callId : `tool-${Date.now()}`;
        setStreamStatus("streaming");
        setToolActivity(`正在运行 ${typeof data?.name === "string" ? data.name : "工具"}`);
        setToolCalls((current) => [
          ...current.filter((call) => call.callId !== callId),
          { callId, name: data?.name ?? "工具", args: data?.args, startedAt: data?.startedAt },
        ]);
      }
      if (event.type === "tool_updated") {
        const data = event.data as { callId?: string; name?: string; partialResult?: unknown } | undefined;
        const callId = typeof data?.callId === "string" ? data.callId : "";
        if (callId) {
          setToolCalls((current) => current.map((call) =>
            call.callId === callId ? { ...call, name: data?.name ?? call.name, args: data?.partialResult ?? call.args } : call,
          ));
        }
      }
      if (event.type === "tool_finished") {
        const data = event.data as { callId?: string; name?: string; result?: unknown; isError?: boolean } | undefined;
        const callId = typeof data?.callId === "string" ? data.callId : "";
        setToolActivity(null);
        if (callId) {
          setToolCalls((current) => current.map((call) =>
            call.callId === callId
              ? { ...call, name: data?.name ?? call.name, result: data?.result, isError: Boolean(data?.isError), finishedAt: new Date().toISOString() }
              : call,
          ));
        }
      }
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
      if (event.type === "approval_requested") {
        const data = event.data as ApprovalInfo & { requestId?: string } | undefined;
        const requestId = data?.requestId;
        if (requestId) {
          setApprovals((current) => [...current.filter((a) => a.requestId !== requestId), {
            requestId,
            kind: data.kind ?? "confirm",
            title: data.title ?? "审批",
            message: data.message ?? "",
            safeLabel: data.safeLabel,
            impact: data.impact,
            options: data.options,
            status: "pending",
          }]);
        }
      }
      if (event.type === "approval_resolved") {
        const data = event.data as { requestId?: string } | undefined;
        const requestId = data?.requestId;
        if (requestId) {
          setApprovals((current) => current.filter((a) => a.requestId !== requestId));
        }
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

    // 加载初始待审批介入（刷新页面后待审批仍存在）
    void loadTaskInterventions(taskId, controller.signal)
      .then((items) => {
        const raw = items as Array<Record<string, unknown>>;
        const pending = raw
          .filter((item) => item.status === "pending")
          .map((item) => ({
            requestId: item.id as string,
            kind: (item.kind as ApprovalInfo["kind"]) ?? "confirm",
            title: (item.title as string) ?? "审批",
            message: (item.message as string) ?? "",
            safeLabel: item.safeLabel as string | undefined,
            impact: item.impact as string | undefined,
            options: item.options as string[] | undefined,
            status: "pending" as const,
          }));
        if (pending.length > 0) setApprovals(pending);
      })
      .catch(() => { /* 忽略：审批会在 SSE 事件中到达 */ });

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

  // 加载任务能力（工具列表、当前模型/思考等级），供运行配置切换 UI
  const activeTaskId = activeTask?.id ?? "";
  useEffect(() => {
    if (!activeTaskId || isLegacy) {
      setCapabilities(null);
      return;
    }
    const controller = new AbortController();
    void loadTaskCapabilities(activeTaskId, controller.signal)
      .then(setCapabilities)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCapabilities(null);
      });
    return () => controller.abort();
  }, [activeTaskId, isLegacy]);

  // 加载任务 Git 状态（改动页签）
  useEffect(() => {
    if (!activeTaskId || isLegacy || !gitOpen) return;
    const controller = new AbortController();
    setGitBusy(true);
    void loadTaskGit(activeTaskId, controller.signal)
      .then(setGitState)
      .catch(() => setGitState(null))
      .finally(() => setGitBusy(false));
    return () => controller.abort();
  }, [activeTaskId, gitOpen, isLegacy]);

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

  async function handleApproval(requestId: string, decision: "approve" | "reject", value?: string) {
    if (!activeTask) return;
    setBusyCommand(`approval-${requestId}`);
    try {
      await resolveIntervention(activeTask.id, requestId, decision, value);
      setApprovals((current) => current.filter((a) => a.requestId !== requestId));
      setFeedback(decision === "approve" ? "已允许该操作。" : "已拒绝该操作。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "审批提交失败。");
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

  const configDisabled = running || busyCommand !== null || configBusy;
  const modelKey = (capa: TaskCapabilitiesResult): string =>
    capa.model ? `${capa.model.provider}:${capa.model.modelId}` : "";
  const selectedModelKey = capabilities ? modelKey(capabilities) : "";
  const currentThinkingLevels = (modelCatalog?.thinkingLevels ?? {})[selectedModelKey] ?? [];

  async function handleSetModel(nextKey: string) {
    if (!activeTask || !nextKey) return;
    const [provider, modelId] = nextKey.split(":");
    if (!provider || !modelId) return;
    setConfigBusy(true);
    try {
      await sendTaskCommand(activeTask.id, { type: "setModel", provider, modelId });
      setFeedback(`已切换到 ${modelId}。`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "切换模型失败。");
    } finally {
      setConfigBusy(false);
    }
  }

  async function handleSetThinkingLevel(level: string) {
    if (!activeTask) return;
    setConfigBusy(true);
    try {
      await sendTaskCommand(activeTask.id, { type: "setThinkingLevel", level });
      setFeedback(`思考等级已设为 ${level}。`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "切换思考等级失败。");
    } finally {
      setConfigBusy(false);
    }
  }

  async function handleToggleTool(toolName: string, active: boolean) {
    if (!activeTask || !capabilities) return;
    const draft = active
      ? capabilities.tools.map((tool) => (tool.name === toolName ? { ...tool, active: false } : tool))
      : capabilities.tools.map((tool) => (tool.name === toolName ? { ...tool, active: true } : tool));
    setCapabilities((current) => (current ? { ...current, tools: draft } : current));
    setConfigBusy(true);
    try {
      const names = draft.filter((tool) => tool.active).map((tool) => tool.name);
      await sendTaskCommand(activeTask.id, { type: "setTools", toolNames: names });
      setFeedback(toolName === "" ? "" : "工具已更新。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "更新工具失败。");
      // 回滚
      const refreshed = await loadTaskCapabilities(activeTask.id).catch(() => null);
      if (refreshed) setCapabilities(refreshed);
    } finally {
      setConfigBusy(false);
    }
  }

  const sendDisabled = sending || streamStatus === "streaming" || !message.trim();

  async function toggleDiff(filePath: string) {
    if (diffOpenPath === filePath) {
      setDiffOpenPath(null);
      setDiffContent(null);
      return;
    }
    setDiffOpenPath(filePath);
    if (!activeTask) return;
    setGitBusy(true);
    try {
      const diff = await loadTaskGitDiff(activeTask.id, filePath);
      setDiffContent(diff.supported && diff.patch ? diff.patch : "该文件暂不支持结构化 diff。");
    } catch {
      setDiffContent("读取 diff 失败。");
    } finally {
      setGitBusy(false);
    }
  }

  async function handleCommit() {
    if (!activeTask || !commitMessage.trim()) return;
    setGitBusy(true);
    try {
      await commitTaskChanges(activeTask.id, commitMessage.trim());
      setCommitMessage("");
      setFeedback("本地提交完成。");
      const refreshed = await loadTaskGit(activeTask.id);
      setGitState(refreshed);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "提交失败。");
    } finally {
      setGitBusy(false);
    }
  }

  async function handlePush() {
    if (!activeTask) return;
    setGitBusy(true);
    try {
      const result = await requestTaskPush(activeTask.id);
      if (result.approvalRequestId) {
        setFeedback(`推送审批已生成，请在审批卡确认。`);
      } else {
        setFeedback("推送审批已排队。");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "推送失败。");
    } finally {
      setGitBusy(false);
    }
  }

  function copyPath(filePath: string) {
    void navigator.clipboard.writeText(filePath).then(
      () => setFeedback("路径已复制。"),
      () => setFeedback("复制失败。"),
    );
  }

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
            {approvals.map((approval) => (
              <ApprovalCard
                key={approval.requestId}
                approval={approval}
                busy={busyCommand === `approval-${approval.requestId}`}
                onApprove={(value) => void handleApproval(approval.requestId, "approve", value)}
                onReject={() => void handleApproval(approval.requestId, "reject")}
              />
            ))}
            {toolCalls.map((call) => (
              <ToolCallCard key={call.callId} call={call} />
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

        {activeTask && capabilities ? (
          <section className="focus-panel__config" aria-label="运行配置">
            <button
              type="button"
              className="focus-panel__config-toggle"
              onClick={() => setConfigOpen((open) => !open)}
              aria-expanded={configOpen}
            >
              运行配置{configDisabled ? " · 运行中禁切" : ""}
              <span className="focus-panel__config-chevron" aria-hidden="true">{configOpen ? "▾" : "▸"}</span>
            </button>
            {configOpen ? (
              <div className="focus-panel__config-body">
                <div className="focus-panel__config-field">
                  <label htmlFor="config-model">模型</label>
                  <select
                    id="config-model"
                    value={selectedModelKey}
                    onChange={(event) => void handleSetModel(event.target.value)}
                    disabled={configDisabled}
                  >
                    {(modelCatalog?.models ?? []).map((model) => (
                      <option key={`${model.provider}:${model.id}`} value={`${model.provider}:${model.id}`}>
                        {model.name}（{model.provider}）
                      </option>
                    ))}
                  </select>
                </div>
                {currentThinkingLevels.length > 0 ? (
                  <div className="focus-panel__config-field">
                    <label htmlFor="config-thinking">思考等级</label>
                    <select
                      id="config-thinking"
                      value={capabilities.thinkingLevel ?? ""}
                      onChange={(event) => void handleSetThinkingLevel(event.target.value)}
                      disabled={configDisabled}
                    >
                      {currentThinkingLevels.map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="focus-panel__config-note">当前模型不支持切分思考等级。</p>
                )}
                <div className="focus-panel__config-field">
                  <span className="focus-panel__config-label">工具</span>
                  {capabilities.tools.length === 0 ? (
                    <p className="focus-panel__config-note">暂无工具信息。</p>
                  ) : (
                    <div className="focus-panel__tool-list">
                      {capabilities.tools.map((tool) => (
                        <label key={tool.name} className="tool-switch">
                          <input
                            type="checkbox"
                            checked={tool.active}
                            onChange={(event) => void handleToggleTool(tool.name, event.target.checked)}
                            disabled={configDisabled}
                          />
                          <span>{tool.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTask && !isLegacy ? (
          <section className="focus-panel__git" aria-label="改动">
            <button
              type="button"
              className="focus-panel__config-toggle"
              onClick={() => setGitOpen((open) => !open)}
              aria-expanded={gitOpen}
            >
              改动
              <span className="focus-panel__config-chevron" aria-hidden="true">{gitOpen ? "▾" : "▸"}</span>
            </button>
            {gitOpen ? (
              <div className="focus-panel__git-body">
                {gitBusy && !gitState ? (
                  <p className="focus-panel__config-note">正在读取 Git 状态…</p>
                ) : !gitState ? (
                  <p className="focus-panel__config-note">无法读取 Git 状态（可能不是 Git 仓库）。</p>
                ) : !gitState.isGitRepository ? (
                  <p className="focus-panel__config-note">当前目录不是 Git 仓库。</p>
                ) : gitState.taskFiles.length === 0 && gitState.baselineFiles.length === 0 ? (
                  <p className="focus-panel__config-note">工作区干净，没有待提交改动。</p>
                ) : (
                  <>
                    <div className="focus-panel__git-summary">
                      <span>任务产生 {gitState.taskFiles.length} 项</span>
                      {gitState.baselineFiles.length > 0 ? (
                        <span className="focus-panel__git-baseline">任务前已有 {gitState.baselineFiles.length} 项（不自动提交）</span>
                      ) : null}
                    </div>
                    <div className="focus-panel__git-files">
                      {gitState.taskFiles.map((file) => (
                        <div key={file.filePath} className="git-file">
                          <span className={`git-file__status git-file__status--${file.status}`}>{statusLabel(file.status)}</span>
                          <button type="button" className="git-file__name" onClick={() => void toggleDiff(file.filePath)}>
                            {basename(file.filePath)}
                          </button>
                          <button type="button" className="git-file__copy" onClick={() => copyPath(file.filePath)}>复制路径</button>
                        </div>
                      ))}
                    </div>
                    {diffOpenPath && diffContent ? (
                      <details className="focus-panel__diff" open>
                        <summary>diff · {basename(diffOpenPath)}</summary>
                        <pre><code>{diffContent}</code></pre>
                      </details>
                    ) : null}
                    <div className="focus-panel__git-actions">
                      <input
                        className="focus-panel__git-message"
                        value={commitMessage}
                        onChange={(event) => setCommitMessage(event.target.value)}
                        placeholder="feat(server): 描述本次提交（Conventional Commits）"
                        disabled={gitBusy}
                      />
                      <div className="focus-panel__git-buttons">
                        <button
                          className="button"
                          type="button"
                          onClick={() => void handleCommit()}
                          disabled={gitBusy || !commitMessage.trim()}
                        >
                          本地提交
                        </button>
                        <button
                          className="button button--primary"
                          type="button"
                          onClick={() => void handlePush()}
                          disabled={gitBusy}
                        >
                          推送（需审批）
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </section>
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

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function statusLabel(status: string): string {
  switch (status) {
    case "modified": return "改";
    case "added": return "增";
    case "deleted": return "删";
    case "untracked": return "新";
    case "renamed": return "重命名";
    default: return status;
  }
}
