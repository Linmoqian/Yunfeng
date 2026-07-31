// Aura 侧栏底部状态卡（装饰性存储信息）。
import { Icons } from "../Icons";

export function StatusCard() {
  return (
    <div className="p-3 border-t border-slate-200/60">
      <div className="p-2.5 rounded-2xl bg-slate-100 border border-slate-200/60 space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-500 flex items-center space-x-1 font-pixel">
            <Icons.HardDrive className="w-3 h-3" />
            <span>已用空间</span>
          </span>
          <span className="text-indigo-600 font-mono text-[11px]">2.4 MB / 10 GB</span>
        </div>
        <div className="nes-progress is-success h-2.5! m-0!">
          <span className="block h-full" style={{ width: "18%" }} />
        </div>
      </div>
    </div>
  );
}
