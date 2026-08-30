import type { SessionMessage } from "@/lib/types";
import { MapleMark } from "./MapleMark";
import { MessageBody, ThinkingBlocks } from "./Markdown";

interface MessageRowProps {
  message: SessionMessage;
  streaming: boolean;
}

/** 单条消息：用户右侧 primary 气泡；助手左侧 avatar + 思考折叠 + 回答卡片。 */
export function MessageRow({ message, streaming }: MessageRowProps) {
  if (message.role === "user") {
    const text = typeof message.content === "string" ? message.content : "";
    // 历史数据可能存在空 content 的用户消息，渲染空气泡会产生无意义圆点。
    if (text.trim() === "") return null;
    return (
      <div className="message-row is-user">
        <div className="message-bubble">{text}</div>
      </div>
    );
  }

  return (
    <div className="message-row is-assistant">
      <div className="message-avatar">
        <MapleMark size={22} />
      </div>
      <div className="message-content">
        <ThinkingBlocks content={message.content} />
        <div className="message-bubble">
          <MessageBody message={message} />
          {streaming && <span className="cursor-blink" />}
        </div>
      </div>
    </div>
  );
}
