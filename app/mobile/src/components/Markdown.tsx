import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionMessage } from "@/lib/types";
import { Icons } from "./Icons";

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
  data?: string;
  mimeType?: string;
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

/** 推理思考折叠块：解析 thinking 块合并渲染。 */
export function ThinkingBlocks({ content }: { content: unknown }) {
  const [open, setOpen] = useState(true);
  if (!Array.isArray(content)) return null;
  const parts = (content as ContentBlock[])
    .filter((b) => b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim() !== "")
    .map((b) => (b.thinking as string).trim());
  if (parts.length === 0) return null;
  return (
    <details className="thinking-block" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="thinking-summary">
        <Icons.BrainCircuit size={13} />
        <span>推理思考过程</span>
        <Icons.ChevronDown size={13} className={open ? "is-open" : ""} />
      </summary>
      <div className="thinking-body">{parts.join("\n\n")}</div>
    </details>
  );
}

function ToolCallBlock({ name, args }: { name: string; args: unknown }) {
  return (
    <div className="tool-call">
      <span className="tool-call-name">🔧 {name}</span>
      {args != null && <pre className="tool-call-args">{JSON.stringify(args, null, 2)}</pre>}
    </div>
  );
}

function ImageBlock({ data, mimeType }: { data: string; mimeType?: string }) {
  return (
    <img
      className="message-image"
      src={`data:${mimeType ?? "image/png"};base64,${data}`}
      alt="attachment"
    />
  );
}

export const MessageBody = memo(function MessageBody({ message }: { message: SessionMessage }) {
  const { text, blocks } = renderContent(message.content);

  if (message.role === "toolResult") {
    const toolName = (message.toolName as string) ?? "tool";
    const isError = message.isError === true;
    return (
      <div className={`tool-result${isError ? " is-error" : ""}`}>
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
        if (b.type === "thinking") return null;
        if (b.type === "toolCall") {
          return <ToolCallBlock key={i} name={(b.name as string) ?? ""} args={b.arguments} />;
        }
        if (b.type === "image" && typeof b.data === "string") {
          return <ImageBlock key={i} data={b.data} mimeType={b.mimeType} />;
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
