// Aura 消息气泡：用户右侧蓝色气泡；助手带头像 + 思考折叠 + 回答卡片。
import type { SessionMessage } from "../../lib/types";
import { MessageBody, ThinkingBlocks } from "../Markdown";
import { Icons } from "../Icons";

interface MessageBubbleProps {
  message: SessionMessage;
  /** 是否为正在流式生成的消息（显示光标） */
  streaming: boolean;
}

export function MessageBubble({ message, streaming }: MessageBubbleProps) {
  if (message.role === "user") {
    const text = typeof message.content === "string" ? message.content : "";
    return (
      <div className="flex items-start justify-end space-x-3">
        <div className="bg-indigo-600 text-white px-4 py-3 rounded-2xl rounded-tr-none text-sm max-w-[80%] shadow-md whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start space-x-3">
      <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-1 border border-indigo-200">
        <Icons.Bot className="w-4 h-4" />
      </div>
      <div className="space-y-3 max-w-[85%]">
        {/* 设计稿：推理思考折叠在回答卡片之外 */}
        <ThinkingBlocks content={message.content} />
        <div className="bg-slate-100 apple-glass-subtle border border-slate-200/80 p-4 rounded-2xl rounded-tl-none text-sm leading-relaxed space-y-2 shadow-md text-slate-700">
          <MessageBody message={message} />
          {streaming && <span className="cursor-blink" />}
        </div>
      </div>
    </div>
  );
}
