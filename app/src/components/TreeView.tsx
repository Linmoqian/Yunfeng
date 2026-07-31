// 共享文件树组件：递归渲染目录/文件节点（B/C 变体复用）。

import type { FileTreeNode } from "../hooks/useFileTree";
import { Icons } from "./Icons";

interface TreeViewProps {
  prefix: "vb" | "vc";
  nodes: FileTreeNode[];
  selectedPath: string | null;
  onToggle: (node: FileTreeNode) => Promise<void>;
  onSelect: (node: FileTreeNode) => Promise<void>;
}

export function TreeView({ prefix, nodes, selectedPath, onToggle, onSelect }: TreeViewProps) {
  return (
    <>
      {nodes.map((n) => (
        <TreeNode
          key={n.path}
          node={n}
          depth={0}
          prefix={prefix}
          selectedPath={selectedPath}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function TreeNode({
  node,
  depth,
  prefix,
  selectedPath,
  onToggle,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  prefix: TreeViewProps["prefix"];
  selectedPath: string | null;
  onToggle: TreeViewProps["onToggle"];
  onSelect: TreeViewProps["onSelect"];
}) {
  const isDir = node.type === "dir";
  return (
    <>
      <div
        className={`${prefix}-node ${selectedPath === node.path ? `${prefix}-node-selected` : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => (isDir ? void onToggle(node) : void onSelect(node))}
      >
        <span>
          {isDir ? (
            node.expanded ? (
              <Icons.FolderOpen size={13} />
            ) : (
              <Icons.Folder size={13} />
            )
          ) : (
            <Icons.File size={13} />
          )}
        </span>
        <span className={`${prefix}-node-name`}>{node.name}</span>
      </div>
      {isDir &&
        node.expanded &&
        node.children?.map((c) => (
          <TreeNode
            key={c.path}
            node={c}
            depth={depth + 1}
            prefix={prefix}
            selectedPath={selectedPath}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}
