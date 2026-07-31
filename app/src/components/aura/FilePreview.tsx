// Aura 文件预览浮层：右侧滑出面板，展示文件内容。
import type { FileTreeNode } from "../../hooks/useFileTree";
import { Icons } from "../Icons";

interface FilePreviewProps {
  file: FileTreeNode;
  content: string;
  loading: boolean;
  onClose: () => void;
}

export function FilePreview({ file, content, loading, onClose }: FilePreviewProps) {
  return (
    <div className="fixed right-4 top-16 bottom-4 w-[420px] max-w-[40vw] z-40 flex flex-col bg-white/95 apple-glass border border-slate-200/80 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200/60 shrink-0">
        <span className="text-xs font-semibold text-slate-700 truncate">{file.name}</span>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition shrink-0"
          title="关闭预览"
        >
          <Icons.X className="w-4 h-4" />
        </button>
      </div>
      <pre className="flex-1 overflow-auto p-4 text-[11px] font-mono text-slate-700 whitespace-pre-wrap">
        {loading ? "加载中…" : content}
      </pre>
    </div>
  );
}
