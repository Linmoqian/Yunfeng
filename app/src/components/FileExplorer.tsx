import type { FileTreeNode } from "../hooks/useFileTree";

interface FileExplorerProps {
  root: string | null;
  tree: FileTreeNode[];
  loading: boolean;
  selectedFile: FileTreeNode | null;
  fileContent: { content: string; truncated: boolean } | null;
  fileLoading: boolean;
  onToggleDir: (node: FileTreeNode) => Promise<void>;
  onSelectFile: (node: FileTreeNode) => Promise<void>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function TreeNode({
  node,
  depth,
  onToggleDir,
  onSelectFile,
  selectedPath,
}: {
  node: FileTreeNode;
  depth: number;
  onToggleDir: (node: FileTreeNode) => Promise<void>;
  onSelectFile: (node: FileTreeNode) => Promise<void>;
  selectedPath: string | null;
}) {
  const isDir = node.type === "dir";

  const handleClick = () => {
    if (isDir) {
      void onToggleDir(node);
    } else {
      void onSelectFile(node);
    }
  };

  const visibleChildren = node.expanded ? node.children ?? [] : [];

  return (
    <>
      <div
        className={`file-node ${isDir ? "file-node-dir" : ""} ${selectedPath === node.path ? "file-node-selected" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={handleClick}
      >
        <span className="file-node-icon">{isDir ? (node.expanded ? "📂" : "📁") : "📄"}</span>
        <span className="file-node-name">{node.name}</span>
        {!isDir && <span className="file-node-size">{formatSize(node.size)}</span>}
      </div>
      {visibleChildren.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          selectedPath={selectedPath}
        />
      ))}
    </>
  );
}

export function FileExplorer({
  root,
  tree,
  loading,
  selectedFile,
  fileContent,
  fileLoading,
  onToggleDir,
  onSelectFile,
}: FileExplorerProps) {
  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        {root ? `📁 ${root.split(/[\\/]/).pop()}` : "文件工作区"}
      </div>
      {!root && <div className="file-explorer-hint">请先在左侧选择项目目录</div>}
      {root && (
        <div className="file-explorer-body">
          <div className="file-tree">
            {loading && <div className="sidebar-hint">加载中…</div>}
            {tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                selectedPath={selectedFile?.path ?? null}
              />
            ))}
          </div>
          {selectedFile && (
            <div className="file-preview">
              <div className="file-preview-header">
                {selectedFile.name}
                {fileLoading && <span className="chat-status"> 加载中…</span>}
              </div>
              <pre className="file-preview-content">{fileContent?.content ?? ""}</pre>
              {fileContent?.truncated && (
                <div className="file-preview-truncated">文件过大，仅显示前 512KB</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
