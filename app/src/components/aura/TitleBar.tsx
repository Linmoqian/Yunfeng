// Aura 标题栏：macOS 红绿灯 + 品牌 + ⌘K 触发 + 模型就绪徽章。
import { Icons } from "../Icons";

interface TitleBarProps {
  modelCount: number;
  onOpenSpotlight: () => void;
}

export function TitleBar({ modelCount, onOpenSpotlight }: TitleBarProps) {
  return (
    <div className="h-12 px-5 flex items-center justify-between border-b border-slate-200/60 bg-slate-100/50 shrink-0">
      {/* macOS 红绿灯（装饰性） */}
      <div className="flex items-center space-x-2">
        <button type="button" title="关闭" className="w-3 h-3 rounded-full bg-[#FF5F56] hover:opacity-80 transition-opacity focus:outline-none" />
        <button type="button" title="最小化" className="w-3 h-3 rounded-full bg-[#FFBD2E] hover:opacity-80 transition-opacity focus:outline-none" />
        <button type="button" title="全屏" className="w-3 h-3 rounded-full bg-[#27C93F] hover:opacity-80 transition-opacity focus:outline-none" />
        <span className="ml-4 text-xs font-semibold text-slate-400 tracking-wider uppercase">
          Aura OS • Agent Desktop
        </span>
      </div>

      {/* ⌘K 命令触发 */}
      <button
        onClick={onOpenSpotlight}
        className="flex items-center space-x-2 px-3.5 py-1 rounded-xl bg-white/80 border border-slate-200/80 hover:bg-slate-50 transition text-xs text-slate-500 shadow-sm"
      >
        <Icons.Search className="w-3.5 h-3.5" />
        <span>呼叫或搜索智能体...</span>
        <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-slate-100 rounded border border-slate-200 font-mono text-slate-500">
          ⌘K
        </kbd>
      </button>

      {/* 就绪徽章 */}
      <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>{modelCount} 智能体就绪</span>
      </div>
    </div>
  );
}
