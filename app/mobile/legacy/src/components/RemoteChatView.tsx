import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { sessions, type Message } from "@/lib/data";
import { RemoteClient, type RemoteConnection, type ServerMessage } from "@/lib/remote";

type Props = {
  id: string | null;
  title: string;
  conn: RemoteConnection | null;
  onBack: () => void;
};

const DEFAULT_CWD = "/";

export default function RemoteChatView({ id, title, conn, onBack }: Props) {
  const seed = id ? sessions.find((s) => s.id === id)?.messages ?? [] : [];
  const [messages, setMessages] = useState<Message[]>(seed);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState(conn ? "正在连接…" : "未连接桌面");
  const bottomRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<RemoteClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (!conn) {
      setStatus("未连接桌面，请到「我的」页配对");
      return;
    }
    let disposed = false;
    sessionIdRef.current = null;
    pendingRef.current = null;
    const client = new RemoteClient(conn);
    clientRef.current = client;
    setStatus("正在连接…");

    let assistantId: string | null = null;
    const ensureAssistant = (): string => {
      if (!assistantId) {
        assistantId = crypto.randomUUID();
        setMessages((prev) => [...prev, { id: assistantId!, role: "assistant", text: "" }]);
      }
      return assistantId;
    };

    const onMessage = (msg: ServerMessage) => {
      if (disposed) return;
      if (msg.type === "rpc.response" && msg.id === "start") {
        if (msg.ok) {
          const data = msg.data as { sessionId: string };
          sessionIdRef.current = data.sessionId;
          setStatus("Agent 在线");
          const text = pendingRef.current;
          pendingRef.current = null;
          if (text) {
            client.send({
              type: "rpc.command",
              id: `c${++idCounter.current}`,
              sessionId: data.sessionId,
              command: { type: "prompt", text },
            });
          }
        } else {
          setStatus(`启动会话失败：${msg.error}`);
        }
        return;
      }
      if (msg.type === "rpc.event") {
        const evt = msg.event;
        if (evt.type === "message_update") {
          const text = typeof evt.text === "string" ? evt.text : "";
          const aid = ensureAssistant();
          setMessages((prev) =>
            prev.map((m) => (m.id === aid ? { ...m, text: m.text + text } : m)),
          );
          setStreaming(true);
        } else if (
          evt.type === "message_complete" ||
          evt.type === "session_completed" ||
          evt.type === "done"
        ) {
          setStreaming(false);
        } else if (typeof evt.text === "string") {
          const aid = ensureAssistant();
          setMessages((prev) =>
            prev.map((m) => (m.id === aid ? { ...m, text: m.text + `\n${evt.text}` } : m)),
          );
        }
        return;
      }
      if (msg.type === "error") {
        setStatus(msg.message);
        setStreaming(false);
      }
    };

    client.connect(onMessage);
    return () => {
      disposed = true;
      client.close();
      clientRef.current = null;
    };
  }, [conn]);

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: t }]);
    setDraft("");
    const client = clientRef.current;
    if (!client) {
      setStatus("未连接桌面，请到「我的」页配对");
      return;
    }
    if (sessionIdRef.current) {
      client.send({
        type: "rpc.command",
        id: `c${++idCounter.current}`,
        sessionId: sessionIdRef.current,
        command: { type: "prompt", text: t },
      });
    } else {
      pendingRef.current = t;
      client.send({ type: "rpc.start", id: "start", payload: { cwd: DEFAULT_CWD } });
    }
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

  const online = conn !== null;

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
            <span
              className={online ? "size-1.5 rounded-full bg-emerald-400" : "size-1.5 rounded-full bg-zinc-400"}
            />
            {online ? status : "未连接桌面"}
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
            <p className="text-sm text-muted-foreground">向 Yunfeng 描述你想做的事</p>
            {!online && <p className="text-xs text-faint">连接桌面后即可远程对话（「我的」页配对）</p>}
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} streaming={streaming && m.role === "assistant" && m.id === messages[messages.length - 1]?.id} />
        ))}
        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-border bg-surface px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface px-3 py-2 focus-within:border-accent">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={online ? "输入指令或提问…" : "未连接桌面"}
            disabled={!online}
            className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug outline-none placeholder:text-faint disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!online || !draft.trim()}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition active:scale-95 disabled:opacity-40"
            aria-label="发送"
          >
            <Send className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({
  message,
  streaming,
}: {
  message: Message;
  streaming: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-snug text-accent-foreground">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-accent">
        <Sparkles className="size-4" />
      </span>
      <div className="max-w-[82%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-[15px] leading-snug">
        {message.text}
        {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
      </div>
    </div>
  );
}
