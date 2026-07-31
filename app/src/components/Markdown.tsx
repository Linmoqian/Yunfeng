import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionMessage } from "../lib/types";
import { Icons } from "./Icons";

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
  [key: string]: unknown;
}

function renderContent(content: unknown): { text: string; blocks: ContentBlock[] } {
  if (typeof content === "string") return { text: content, blocks: [] };
  if (Array.isArray(content)) {
    const blocks = content as ContentBlock[];
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
    return { text, blocks };
  }
  return { text: "", blocks: [] };
}

/** 设计稿「推理思考过程」折叠块：解析消息中的 thinking 块，合并渲染为一个 details。 */
export function ThinkingBlocks({ content }: { content: unknown }) {
  const [open, setOpen] = useState(true);
  if (!Array.isArray(content)) return null;
  const parts = (content as ContentBlock[])
    .filter((b) => b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim() !== "")
    .map((b) => (b.thinking as string).trim());
  if (parts.length === 0) return null;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group bg-slate-100/60 rounded-xl border border-slate-200/60 overflow-hidden text-xs"
    >
      <summary className="flex items-center justify-between px-3.5 py-2 cursor-pointer select-none text-slate-500 hover:text-slate-700 list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center space-x-2 font-mono">
          <Icons.BrainCircuit className="w-3.5 h-3.5 text-indigo-500" />
          <span>推理思考过程</span>
        </span>
        <Icons.ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </summary>
      <div className="px-3.5 py-2.5 border-t border-slate-200/60 text-slate-600 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
        {parts.join("\n\n")}
      </div>
    </details>
  );
}

function ToolCallBlock({ name, args }: { name: string; args: unknown }) {
  return (
    <div className="tool-call-block">
      <span className="tool-call-name">🔧 {name}</span>
      {args != null && <pre className="tool-call-args">{JSON.stringify(args, null, 2)}</pre>}
    </div>
  );
}

function ImageBlock({ data, mimeType }: { data: string; mimeType?: string }) {
  return <img className="message-image" src={`data:${mimeType ?? "image/png"};base64,${data}`} alt="attachment" />;
}

export const MessageBody = memo(function MessageBody({ message }: { message: SessionMessage }) {
  const { text, blocks } = renderContent(message.content);

  if (message.role === "toolResult") {
    const toolName = (message.toolName as string) ?? "tool";
    const isError = message.isError === true;
    return (
      <div className={`tool-result ${isError ? "tool-result-error" : ""}`}>
        <div className="tool-result-header">
          {isError ? "⚠️" : "✅"} {toolName}
        </div>
        {text && <pre className="tool-result-output">{text}</pre>}
      </div>
    );
  }

  return (
    <div className="message-body">
      {blocks.map((b, i) => {
        // thinking 由 ThinkingBlocks 在回答卡片外渲染，这里跳过
        if (b.type === "thinking") return null;
        if (b.type === "toolCall") {
          return <ToolCallBlock key={i} name={(b.name as string) ?? ""} args={b.arguments} />;
        }
        if (b.type === "image" && typeof b.data === "string") {
          return <ImageBlock key={i} data={b.data} mimeType={b.mimeType as string | undefined} />;
        }
        return null;
      })}
      {text && (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
});
