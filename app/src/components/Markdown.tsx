import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionMessage } from "../lib/types";

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

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} 思考过程
      </button>
      {open && <pre className="thinking-text">{text}</pre>}
    </div>
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
        if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim() !== "") {
          return <ThinkingBlock key={i} text={b.thinking} />;
        }
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
