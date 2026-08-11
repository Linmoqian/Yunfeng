import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { sessions, type Message } from "@/lib/data";

type Props = {
  id: string | null;
  title: string;
  onBack: () => void;
};

const CANNED_REPLY = "已收到。移动端接入 sidecar 后将在这里返回真实回复。";

export default function ChatView({ id, title, onBack }: Props) {
  const seed = id ? sessions.find((s) => s.id === id)?.messages ?? [] : [];
  const [messages, setMessages] = useState<Message[]>(seed);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: t }]);
    setDraft("");
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: CANNED_REPLY },
      ]);
    }, 400);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-edge bg-surface/80 px-3 py-3 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="grid size-9 place-items-center rounded-full text-ink-dim transition active:scale-95"
          aria-label="返回"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{title}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Agent 在线
          </p>
        </div>
      </header>

      <main className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Sparkles className="size-6" />
            </span>
            <p className="mt-2 text-[15px] font-medium">开始新的对话</p>
            <p className="text-sm text-ink-dim">向 Yunfeng 描述你想做的事</p>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-edge bg-surface/80 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-edge bg-white/[0.05] px-3 py-2 focus-within:border-edge-strong">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入指令或提问…"
            className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug outline-none placeholder:text-ink-faint"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-surface transition active:scale-95 disabled:opacity-40"
            aria-label="发送"
          >
            <Send className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-snug text-surface">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.07] text-accent">
        <Sparkles className="size-4" />
      </span>
      <div className="max-w-[82%] rounded-2xl rounded-bl-md border border-edge bg-white/[0.05] px-4 py-2.5 text-[15px] leading-snug">
        {message.text}
      </div>
    </div>
  );
}
