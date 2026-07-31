// Aura 工作区文件夹树：真实文件树（useFileTree），目录可展开，文件点击打开预览。
import type { FileTreeNode } from "../../hooks/useFileTree";
import { Icon, Icons, type IconName } from "../Icons";

interface FolderTreeProps {
  tree: FileTreeNode[];
  loading: boolean;
  hasRoot: boolean;
  onToggleDir: (node: FileTreeNode) => Promise<void>;
  onOpenFile: (node: FileTreeNode) => void;
  onPickDirectory: () => Promise<void>;
  onNewFolder: () => void;
}

/** 按扩展名映射文件图标与颜色 */
function fileIcon(name: string): { icon: IconName; color: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
      return { icon: "FileText", color: "text-indigo-500" };
    case "json":
      return { icon: "FileJson", color: "text-emerald-500" };
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return { icon: "FileCode2", color: "text-blue-500" };
    case "py":
      return { icon: "FileCode", color: "text-amber-500" };
    default:
      return { icon: "File", color: "text-slate-400" };
  }
}

export function FolderTree({
  tree,
  loading,
  hasRoot,
  onToggleDir,
  onOpenFile,
  onPickDirectory,
  onNewFolder,
}: FolderTreeProps) {
  return (
    <div className="pt-2 space-y-1 border-t border-slate-200/60">
      <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        <span className="flex items-center space-x-1.5">
          <Icons.Folder className="w-3.5 h-3.5" />
          <span>工作区文件夹</span>
        </span>
        {hasRoot && (
          <button onClick={onNewFolder} className="hover:text-indigo-600 transition" title="新建文件夹">
            <Icons.FolderPlus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!hasRoot ? (
        <button
          onClick={onPickDirectory}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:text-indigo-600 text-slate-500 text-xs transition"
        >
          <Icons.FolderPlus className="w-3.5 h-3.5" />
          <span>选择项目目录</span>
        </button>
      ) : (
        <div className="space-y-1 text-xs">
          {loading && <div className="px-2.5 py-1 text-[11px] text-slate-400">加载中…</div>}
          {tree.map((n) => (
            <FolderNode
              key={n.path}
              node={n}
              depth={0}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
          {!loading && tree.length === 0 && (
            <div className="px-2.5 py-1 text-[11px] text-slate-400">目录为空</div>
          )}
        </div>
      )}
    </div>
  );
}

function FolderNode({
  node,
  depth,
  onToggleDir,
  onOpenFile,
}: {
  node: FileTreeNode;
  depth: number;
  onToggleDir: FolderTreeProps["onToggleDir"];
  onOpenFile: FolderTreeProps["onOpenFile"];
}) {
  const isDir = node.type === "dir";
  const pad = { paddingLeft: `${depth * 16 + 8}px` };

  if (isDir) {
    return (
      <div>
        <button
          onClick={() => void onToggleDir(node)}
          className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-200/40 cursor-pointer text-slate-700 font-medium select-none text-left"
          style={pad}
        >
          <Icons.ChevronRight
            className={`w-3 h-3 text-slate-400 transition-transform shrink-0 ${node.expanded ? "rotate-90" : ""}`}
          />
          {node.expanded ? (
            <Icons.FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            <Icons.FolderClosed className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
          <span className="text-[10px] text-slate-400 font-mono ml-auto shrink-0">
            {node.children?.length ?? 0}
          </span>
        </button>
        {node.expanded &&
          node.children?.map((c) => (
            <FolderNode
              key={c.path}
              node={c}
              depth={depth + 1}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
      </div>
    );
  }

  const icon = fileIcon(node.name);
  return (
    <button
      onClick={() => onOpenFile(node)}
      className="w-full flex items-center space-x-2 px-2.5 py-1 rounded-md hover:bg-slate-200/50 text-slate-600 text-[11px] transition text-left truncate"
      style={pad}
    >
      <Icon name={icon.icon} size={12} className={`${icon.color} shrink-0`} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
