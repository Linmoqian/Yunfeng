import { useEffect, useRef, useState } from "react";
import type { SessionMessage } from "../lib/types";
import { MessageBody } from "./Markdown";

interface ChatWindowProps {
  messages: SessionMessage[];
  streamingMessage: SessionMessage | null;
  runningTools: { id: string; name: string }[];
  isStreaming: boolean;
  isCompacting: boolean;
  sessionName: string;
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
}

function roleLabel(role: string): string {
  switch (role) {
    case "user":
      return "你";
    case "assistant":
      return "助手";
    case "toolResult":
      return "工具";
    case "custom":
      return "系统";
    default:
      return role;
  }
}

export function ChatWindow({
  messages,
  streamingMessage,
  runningTools,
  isStreaming,
  isCompacting,
  sessionName,
  disabled,
  onSend,
  onAbort,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingMessage, runningTools]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || disabled) return;
    setInput("");
    await onSend(text);
  };

  const allMessages: SessionMessage[] = streamingMessage
    ? [...messages, streamingMessage]
    : messages;

  return (
    <div className="chat-window">
      <div className="chat-header">
        <span className="chat-title">{sessionName || "未命名会话"}</span>
        {(isCompacting || runningTools.length > 0 || isStreaming) && (
          <span className="chat-status">
            {isCompacting
              ? "压缩上下文…"
              : runningTools.map((t) => t.name).join(", ") || "思考中…"}
          </span>
        )}
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {allMessages.length === 0 && !isStreaming && (
          <div className="chat-empty">选择一个会话，或新建会话开始对话</div>
        )}
        {allMessages.map((m, i) => {
          const isLast = i === allMessages.length - 1;
          const isStreamingMsg =
            isLast && streamingMessage !== null && m === streamingMessage;
          return (
            <div key={i} className={`message message-${m.role}`}>
              <div className="message-role">{roleLabel(m.role)}</div>
              <MessageBody message={m} />
              {isStreamingMsg && <span className="cursor-blink" />}
            </div>
          );
        })}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          disabled={disabled}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <div className="chat-actions">
          {isStreaming ? (
            <button type="button" className="btn btn-danger" onClick={() => void onAbort()}>
              停止
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={disabled || !input.trim()}>
              发送
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
