import { useState, type FormEvent, type ReactNode } from "react";
import {
  CheckCircle2,
  Cpu,
  Info,
  Link2,
  Monitor,
  MonitorUp,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RemoteClient, type RemoteConnection } from "@/lib/remote";

type Props = {
  conn: RemoteConnection | null;
  onConnected: (conn: RemoteConnection | null) => void;
  onOpenDesktop?: () => void;
};

export default function SettingsView({ conn, onConnected, onOpenDesktop }: Props) {
  const [baseUrl, setBaseUrl] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onPair(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await RemoteClient.pair(baseUrl, code, "Yunfeng 手机");
      onConnected({
        baseUrl: baseUrl.trim().replace(/\/+$/, ""),
        token: result.token,
        deviceId: result.deviceId,
      });
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    onConnected(null);
  }

  return (
    <div className="px-5 pb-8 pt-6">
      <h1 className="text-[22px] font-semibold tracking-tight">我的</h1>

      <Section label="连接桌面" icon={<Link2 className="size-4" />}>
        {conn ? (
          <div className="flex flex-col items-end gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="size-3.5" />
              已连接
            </span>
            <p className="max-w-[200px] truncate text-right text-[11px] text-muted-foreground">
              {conn.baseUrl}
            </p>
            <p className="max-w-[200px] truncate text-right text-[11px] text-faint">
              设备 {conn.deviceId.slice(0, 8)}
            </p>
            <div className="flex gap-2">
              {onOpenDesktop && (
                <button
                  onClick={onOpenDesktop}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition active:scale-95"
                >
                  <MonitorUp className="size-3.5" />
                  远程桌面
                </button>
              )}
              <button
                onClick={disconnect}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition active:scale-95"
              >
                <Unplug className="size-3.5" />
                断开
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onPair} className="w-full space-y-2">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="桌面服务地址，如 http://192.168.1.10:8787"
              inputMode="url"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-accent"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 位配对码"
              inputMode="numeric"
              maxLength={6}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm tracking-[0.3em] outline-none placeholder:text-faint focus:border-accent"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy || baseUrl.trim().length === 0 || code.length !== 6}
              className="w-full rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? "连接中…" : "连接"}
            </button>
          </form>
        )}
      </Section>

      <Section label="运行模式" icon={<Cpu className="size-4" />}>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
          本地模式
        </span>
      </Section>

      <Section label="设备协同" icon={<Wifi className="size-4" />}>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Monitor className="size-3.5" />
            本机
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Smartphone className="size-3.5" />
            远程设备
          </span>
        </div>
      </Section>

      <Section label="数据与安全" icon={<ShieldCheck className="size-4" />}>
        <p className="text-xs leading-relaxed text-muted-foreground">本地优先，文件与知识库不出设备。</p>
      </Section>

      <Section label="关于" icon={<Info className="size-4" />}>
        <p className="text-xs text-muted-foreground">Yunfeng Mobile v0.1.0</p>
      </Section>
    </div>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <span className={cn("text-accent")}>{icon}</span>
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}
