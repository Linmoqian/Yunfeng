import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, Sparkles } from "lucide-react";
import type { SessionMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  [key: string]: unknown;
}

function renderText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
  }
  return "";
}

function getThinkingParts(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return (content as ContentBlock[])
    .filter((b) => b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim() !== "")
    .map((b) => (b.thinking as string).trim());
}

export function UserBubble({ message }: { message: SessionMessage }) {
  const text = typeof message.content === "string" ? message.content : renderText(message.content);
  return (
    <div className="msg-in flex justify-end">
      <div className="max-w-[82%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-snug text-accent-foreground">
        {text}
      </div>
    </div>
  );
}

export function AssistantBubble({ message, streaming }: { message: SessionMessage; streaming: boolean }) {
  const text = renderText(message.content);
  const thinkingParts = getThinkingParts(message.content);
  return (
    <div className="msg-in flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-accent">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 max-w-[86%] flex-1">
        {thinkingParts.length > 0 && (
          <ThinkingBlocks streaming={streaming} parts={thinkingParts} />
        )}
        {text && (
          <div className="md-body rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            {streaming && <span className="cursor-blink" />}
          </div>
        )}
        {streaming && !text && <span className="cursor-blink" />}
      </div>
    </div>
  );
}

/** 推理思考折叠块：流式生成时自动展开，结束后可手动折叠。 */
function ThinkingBlocks({
  streaming,
  parts,
}: {
  streaming: boolean;
  parts: string[];
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? streaming;

  return (
    <details
      className="mb-2"
      open={open}
      onToggle={(e) => setUserOpen(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        思考过程
        {streaming && <span className="cursor-blink" />}
      </summary>
      <div className="mt-1.5 whitespace-pre-wrap rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {parts.join("\n\n")}
      </div>
    </details>
  );
}
