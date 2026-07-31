// Aura 侧栏底部状态卡（装饰性存储信息）。
import { Icons } from "../Icons";

export function StatusCard() {
  return (
    <div className="p-3 border-t border-slate-200/60">
      <div className="p-2.5 rounded-2xl bg-white/60 border border-slate-200/60 space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-500 flex items-center space-x-1">
            <Icons.HardDrive className="w-3 h-3" />
            <span>已用空间</span>
          </span>
          <span className="text-indigo-600 font-mono text-[11px]">2.4 MB / 10 GB</span>
        </div>
        <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden">
          <div className="bg-indigo-500 h-full w-[18%] rounded-full" />
        </div>
      </div>
    </div>
  );
}
