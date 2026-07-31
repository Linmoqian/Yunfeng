// 共享消息流组件：渲染消息列表 + 流式光标 + 自动滚动。
// className 为滚动容器（各变体布局类名不同），消息项类名由 prefix 拼接。

import { useEffect, useRef, type ReactNode } from "react";
import type { SessionMessage } from "../lib/types";
import { MessageBody } from "./Markdown";

interface MessageListProps {
  prefix: "va" | "vb" | "vc";
  className: string;
  messages: SessionMessage[];
  streamingMessage: SessionMessage | null;
  /** 是否显示消息角色标签（A/B 变体显示，C 不显示） */
  showRoleLabels?: boolean;
  /** 消息内容 wrapper 类名（A 变体需要 va-msg-body） */
  bodyClass?: string;
  /** 空状态内容 */
  empty?: ReactNode;
}

export function MessageList({
  prefix,
  className,
  messages,
  streamingMessage,
  showRoleLabels = false,
  bodyClass,
  empty,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingMessage]);

  const allMessages: SessionMessage[] = streamingMessage
    ? [...messages, streamingMessage]
    : messages;

  return (
    <div className={className} ref={scrollRef}>
      {allMessages.length === 0 && !streamingMessage && empty}
      {allMessages.map((m, i) => {
        const cursor = streamingMessage === m && m.role === "assistant" && (
          <span className="cursor-blink" />
        );
        return (
          <div key={i} className={`${prefix}-msg ${prefix}-msg-${m.role}`}>
            {showRoleLabels && m.role !== "user" && (
              <div className={`${prefix}-msg-role`}>
                {m.role === "assistant" ? "Pi" : "工具"}
              </div>
            )}
            {bodyClass ? (
              <div className={bodyClass}>
                <MessageBody message={m} />
                {cursor}
              </div>
            ) : (
              <>
                <MessageBody message={m} />
                {cursor}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
