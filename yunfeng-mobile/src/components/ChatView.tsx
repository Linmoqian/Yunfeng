import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type UIEvent } from "react";
import { ArrowLeft, RotateCcw, Send, Sparkles, Square } from "lucide-react";
import type { SidecarClient } from "@/lib/api";
import { useChat } from "@/hooks/useChat";
import { sessions } from "@/lib/data";
import type { SessionMessage } from "@/lib/types";
import { AssistantBubble, UserBubble } from "./MessageBubble";
import { ToolCard } from "./ToolCard";

type Props = {
  id: string | null;
  title: string;
  onBack: () => void;
  client: SidecarClient | null;
};

export default function ChatView({ id, title, onBack, client }: Props) {
  const chat = useChat(client);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const seed = useMemo(() => {
    const s = id ? sessions.find((x) => x.id === id) : undefined;
    return (s?.messages ?? []).map(
      (m) => ({ role: m.role, content: m.text }) as SessionMessage,
    );
  }, [id]);

  const allMessages = useMemo(
    () => [...seed, ...chat.messages, ...(chat.streamingMessage ? [chat.streamingMessage] : [])],
    [seed, chat.messages, chat.streamingMessage],
  );

  // 仅在接近底部时自动滚动，避免打断上滑阅读
  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [allMessages.length, chat.tools.length]);

  function onScroll(e: UIEvent<HTMLElement>) {
    const el = e.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function send() {
    const t = draft.trim();
    if (!t || chat.isStreaming) return;
    setDraft("");
    void chat.sendPrompt(t);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInput(e: FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-3 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition active:scale-95"
          aria-label="返回"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{title}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-faint">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {client ? "本地模式" : "离线"}
            {chat.isStreaming && " · 思考中…"}
          </p>
        </div>
      </header>

      <main onScroll={onScroll} className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {allMessages.length === 0 && !chat.isStreaming && (
          <div className="flex flex-col items-center gap-2 pt-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Sparkles className="size-6" />
            </span>
            <p className="mt-2 text-[15px] font-medium">开始新的对话</p>
            <p className="text-sm text-muted-foreground">向 Yunfeng 描述你想做的事</p>
          </div>
        )}

        {allMessages.map((m, i) => {
          if (m.role === "user") {
            return <UserBubble key={`${m.timestamp ?? "u"}-${i}`} message={m} />;
          }
          const isLastAssistant = i === allMessages.length - 1;
          return (
            <div key={`${m.timestamp ?? "a"}-${i}`} className="space-y-2">
              {isLastAssistant && chat.tools.length > 0 && (
                <div className="space-y-2">
                  {chat.tools.map((t) => (
                    <ToolCard key={t.id} tool={t} />
                  ))}
                </div>
              )}
              <AssistantBubble
                message={m}
                streaming={chat.isStreaming && isLastAssistant}
              />
            </div>
          );
        })}

        {chat.error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <span className="min-w-0 flex-1 break-all">{chat.error}</span>
            <button
              onClick={() => void chat.retryLast()}
              className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-muted-foreground transition active:scale-95"
            >
              <RotateCcw className="size-3" />
              重试
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-border bg-surface px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-white/[0.05] px-3 py-2 focus-within:border-accent">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onInput(e);
            }}
            onKeyDown={onKeyDown}
            placeholder="输入指令或提问…"
            className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug outline-none placeholder:text-faint"
          />
          {chat.isStreaming ? (
            <button
              type="button"
              onClick={() => void chat.abort()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition active:scale-95"
              aria-label="停止"
            >
              <Square className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition active:scale-95 disabled:opacity-40"
              aria-label="发送"
            >
              <Send className="size-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
