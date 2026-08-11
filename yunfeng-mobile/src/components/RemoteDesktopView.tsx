import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, Monitor, MousePointerClick } from "lucide-react";
import { RemoteClient, type RemoteConnection, type ServerMessage } from "@/lib/remote";

type Props = {
  conn: RemoteConnection;
  onBack: () => void;
};

export default function RemoteDesktopView({ conn, onBack }: Props) {
  const [frame, setFrame] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  const [status, setStatus] = useState("连接中…");
  const imgRef = useRef<HTMLImageElement>(null);
  const clientRef = useRef<RemoteClient | null>(null);

  useEffect(() => {
    const client = new RemoteClient(conn);
    clientRef.current = client;
    let stopped = false;

    const onMessage = (msg: ServerMessage) => {
      if (stopped) return;
      if (msg.type === "desktop.frame") {
        setFrame(`data:${msg.mime};base64,${msg.data}`);
        setSeq(msg.seq);
        setStatus("实时预览");
      } else if (msg.type === "rpc.response" && msg.id === "dstart") {
        setStatus(msg.ok ? "已连接" : `启动失败：${msg.error}`);
      } else if (msg.type === "desktop.stopped") {
        setStatus(`已停止${msg.reason ? `（${msg.reason}）` : ""}`);
      } else if (msg.type === "error") {
        setStatus(msg.message);
      }
    };

    client.connect(onMessage);
    client.send({ type: "desktop.start", id: "dstart", fps: 2 });
    return () => {
      stopped = true;
      client.send({ type: "desktop.stop", id: "dstop" });
      client.close();
    };
  }, [conn]);

  function onTap(e: MouseEvent<HTMLImageElement>) {
    const img = imgRef.current;
    const client = clientRef.current;
    if (!img || !client || !frame) return;
    const rect = img.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * img.naturalWidth);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * img.naturalHeight);
    client.send({ type: "desktop.input", id: "tap", input: { kind: "move", x, y } });
    client.send({ type: "desktop.input", id: "tap", input: { kind: "click", x, y } });
  }

  return (
    <div className="flex h-dvh flex-col bg-black">
      <header className="flex items-center gap-3 border-b border-white/10 bg-black/80 px-3 py-3 text-white backdrop-blur-xl">
        <button
          onClick={onBack}
          className="grid size-9 place-items-center rounded-full text-white/70 transition active:scale-95"
          aria-label="返回"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-medium">
            <Monitor className="size-4" />
            远程桌面
          </p>
          <p className="truncate text-[11px] text-white/50">
            {status}
            {seq > 0 ? ` · 第 ${seq} 帧` : ""}
          </p>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        {frame ? (
          <img
            ref={imgRef}
            src={frame}
            alt="远程桌面画面"
            className="h-full w-full object-contain"
            onClick={onTap}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            {status}
          </div>
        )}
      </main>

      <footer className="flex items-center justify-center gap-2 border-t border-white/10 bg-black/80 px-4 py-3 text-[11px] text-white/50">
        <MousePointerClick className="size-3.5" />
        点击画面 = 移动 + 点击
      </footer>
    </div>
  );
}
