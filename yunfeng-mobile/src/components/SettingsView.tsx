import type { ReactNode } from "react";
import { Cpu, Info, Monitor, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsView() {
  return (
    <div className="px-5 pb-8 pt-6">
      <h1 className="text-[22px] font-semibold tracking-tight">我的</h1>

      <Section label="运行模式" icon={<Cpu className="size-4" />}>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
          本地模式
        </span>
      </Section>

      <Section label="设备协同" icon={<Wifi className="size-4" />}>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-ink-dim">
            <Monitor className="size-3.5" />
            本机
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-ink-dim">
            <Smartphone className="size-3.5" />
            远程设备
          </span>
        </div>
      </Section>

      <Section label="数据与安全" icon={<ShieldCheck className="size-4" />}>
        <p className="text-xs leading-relaxed text-ink-dim">本地优先，文件与知识库不出设备。</p>
      </Section>

      <Section label="关于" icon={<Info className="size-4" />}>
        <p className="text-xs text-ink-dim">Yunfeng Mobile v0.1.0</p>
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
    <div className="mt-4 overflow-hidden rounded-2xl border border-edge bg-white/[0.04]">
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <span className={cn("text-accent")}>{icon}</span>
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}
