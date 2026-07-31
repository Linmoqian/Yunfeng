import { ChevronRight, File, FolderClosed, FolderOpen, FolderPlus } from "lucide-react";
import type { FileTreeNode } from "@/hooks/useFileTree";

interface FolderTreeProps {
  tree: FileTreeNode[];
  loading: boolean;
  hasRoot: boolean;
  onToggleDir: (node: FileTreeNode) => void;
  onOpenFile: (node: FileTreeNode) => void;
  onPickDirectory: () => void;
}

export function FolderTree({
  tree,
  loading,
  hasRoot,
  onToggleDir,
  onOpenFile,
  onPickDirectory,
}: FolderTreeProps) {
  return (
    <div className="sidebar-section">
      <div className="section-heading">
        <span>工作区</span>
      </div>
      {!hasRoot ? (
        <button type="button" className="tree-anchor" onClick={onPickDirectory}>
          <FolderPlus size={14} />
          选择项目目录
        </button>
      ) : (
        <div>
          {loading && <div className="empty-hint">加载中…</div>}
          {tree.map((n) => (
            <FolderNode
              key={n.path}
              node={n}
              depth={0}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
          {!loading && tree.length === 0 && <div className="empty-hint">目录为空</div>}
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
  const pad = { paddingLeft: `${depth * 14 + 8}px` };

  if (isDir) {
    return (
      <div>
        <button
          type="button"
          className="tree-node is-dir"
          style={pad}
          onClick={() => onToggleDir(node)}
        >
          <ChevronRight
            size={13}
            style={{
              transform: node.expanded ? "rotate(90deg)" : "none",
              transition: "transform 150ms ease",
            }}
          />
          {node.expanded ? <FolderOpen size={14} /> : <FolderClosed size={14} />}
          <span>{node.name}</span>
          <small>{node.children?.length ?? 0}</small>
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

  return (
    <button
      type="button"
      className="tree-node"
      style={pad}
      onClick={() => onOpenFile(node)}
    >
      <File size={13} />
      <span>{node.name}</span>
    </button>
  );
}
