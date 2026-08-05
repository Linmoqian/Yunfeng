import { useEffect, useRef, useState } from "react";
import {
  loadTaskConversation,
  subscribeTaskEvents,
  type TaskConversationMessage,
  type TaskStreamEvent,
} from "../../services/taskService";
import type { TaskSummary } from "./taskPresentation";

interface TaskFocusPanelProps {
  task: TaskSummary;
  onClose: () => void;
  onSend: (taskId: string, message: string) => Promise<void>;
}

const STREAMING_MESSAGE_ID = "__streaming_assistant__";

type ConversationRole = "user" | "assistant" | "tool";

interface ConversationItem {
  id: string;
  role: ConversationRole;
  text: string;
  streaming?: boolean;
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

function normalizeConversationMessage(message: TaskConversationMessage, index: number): ConversationItem | null {
  const text = contentToText(message.content).trim();
  if (!text) return null;
  const role: ConversationRole = message.role === "user" ? "user" : message.role === "assistant" ? "assistant" : "tool";
  return {
    id: message.id ?? `${role}-${index}`,
    role,
    text,
  };
}

function mergeConversation(current: ConversationItem[], loaded: ConversationItem[]): ConversationItem[] {
  const loadedIds = new Set(loaded.map((message) => message.id));
  return [...loaded, ...current.filter((message) => message.id === STREAMING_MESSAGE_ID || !loadedIds.has(message.id))];
}

function getTextDelta(event: TaskStreamEvent): string | null {
  if (event.type !== "message_update" || !event.assistantMessageEvent || typeof event.assistantMessageEvent !== "object") {
    return null;
  }
  const delta = event.assistantMessageEvent as { type?: string; delta?: unknown };
  return delta.type === "text_delta" && typeof delta.delta === "string" ? delta.delta : null;
}

export function TaskFocusPanel({
  task,
  onClose,
  onSend,
}: TaskFocusPanelProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "idle" | "streaming" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const conversationLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessage("");
    setFeedback(null);
    setConversation([]);
    setConversationLoading(true);
    setStreamStatus("connecting");
    setStreamError(null);
    setToolActivity(null);

    const controller = new AbortController();
    const unsubscribe = subscribeTaskEvents(task.id, (event) => {
      if (event.type === "agent_start") {
        setStreamStatus("streaming");
        setStreamError(null);
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

      if (event.type === "tool_execution_start") {
        setStreamStatus("streaming");
        setToolActivity(`正在运行 ${typeof event.toolName === "string" ? event.toolName : "工具"}`);
      }
      if (event.type === "tool_execution_end") setToolActivity(null);
      if (event.type === "prompt_error") {
        setStreamStatus("error");
        setStreamError(typeof event.errorMessage === "string" ? event.errorMessage : "Agent 执行失败");
        setToolActivity(null);
      }
      if (event.type === "agent_end" || event.type === "prompt_done") {
        setStreamStatus("idle");
        setToolActivity(null);
        setConversation((current) => current.map((item) => (
          item.id === STREAMING_MESSAGE_ID ? { ...item, id: `assistant-${Date.now()}`, streaming: false } : item
        )));
      }
    }, (connected) => {
      if (!connected) setStreamStatus("connecting");
    });

    void loadTaskConversation(task.id, controller.signal)
      .then((messages) => {
        const loaded = messages.map(normalizeConversationMessage).filter((message): message is ConversationItem => message !== null);
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
  }, [task.id]);

  useEffect(() => {
    const log = conversationLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [conversation, toolActivity]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || sending) return;

    const nextMessage = message.trim();
    setSending(true);
    setFeedback(null);
    setStreamError(null);
    setConversation((current) => [...current, {
      id: `user-${Date.now()}`,
      role: "user",
      text: nextMessage,
    }]);
    try {
      await onSend(task.id, nextMessage);
      setMessage("");
      setFeedback("已发送，正在等待 Agent 回复。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "发送失败，请稍后重试。");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="focus-panel focus-panel--inline" role="region" aria-label="当前会话">
      <div className="focus-panel__body">
        <header className="focus-panel__header">
          <div>
            <p className="eyebrow">{task.projectName}</p>
            <h2 id="focus-panel-title">{task.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭任务详情">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section className="conversation-section" aria-labelledby="conversation-title">
          <div className="focus-panel__section-heading">
            <h3 id="conversation-title">对话</h3>
            <span>{streamStatus === "streaming" ? "Agent 正在回复" : streamStatus === "connecting" ? "正在连接" : "实时同步"}</span>
          </div>
          <div ref={conversationLogRef} className="conversation-log" role="log" aria-label="会话对话" aria-live="polite">
            {conversationLoading ? <p className="conversation-placeholder">正在读取会话记录…</p> : null}
            {!conversationLoading && conversation.length === 0 ? <p className="conversation-placeholder">这段会话还没有可展示的消息。</p> : null}
            {conversation.map((item) => (
              <article key={item.id} className={`conversation-message conversation-message--${item.role} ${item.streaming ? "conversation-message--streaming" : ""}`.trim()}>
                <span className="conversation-message__role">{item.role === "user" ? "你" : item.role === "assistant" ? "Agent" : "工具"}</span>
                <p>{item.text}</p>
              </article>
            ))}
            {toolActivity ? <p className="conversation-tool-status" role="status">{toolActivity}</p> : null}
            {streamError ? <p className="conversation-error" role="alert">{streamError}</p> : null}
          </div>
        </section>

        <form className="focus-panel__composer" onSubmit={handleSubmit}>
          <label htmlFor="task-message">继续这个任务</label>
          <textarea
            id="task-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="补充要求、回答问题，或告诉 Agent 下一步"
            rows={3}
            disabled={sending}
          />
          <div className="focus-panel__composer-footer">
            <span role={feedback && feedback.includes("失败") ? "alert" : "status"}>{feedback}</span>
            <button className="button button--primary" type="submit" disabled={sending || streamStatus === "streaming" || !message.trim()}>
              {sending ? "正在发送" : "发送要求"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
