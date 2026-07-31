import { useCallback, useEffect, useState } from "react";
import type { SidecarClient } from "../lib/api";
import type { FsEntry } from "../lib/types";

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  children?: FileTreeNode[];
  expanded?: boolean;
}

interface UseFileTreeResult {
  root: string | null;
  tree: FileTreeNode[];
  loading: boolean;
  error: string | null;
  selectedFile: FileTreeNode | null;
  fileContent: { content: string; truncated: boolean } | null;
  fileLoading: boolean;
  setRoot: (root: string) => void;
  toggleDir: (node: FileTreeNode) => Promise<void>;
  selectFile: (node: FileTreeNode) => Promise<void>;
}

export { type UseFileTreeResult };

export function useFileTree(client: SidecarClient | null): UseFileTreeResult {
  const [root, setRootState] = useState<string | null>(null);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);
  const [fileContent, setFileContent] = useState<{ content: string; truncated: boolean } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const loadChildren = useCallback(
    async (parent: FileTreeNode): Promise<void> => {
      if (!client || !root) return;
      try {
        const { entries } = await client.listDir(root, parent.path);
        const children: FileTreeNode[] = entries.map((e: FsEntry) => ({
          name: e.name,
          path: e.path,
          type: e.type,
          size: e.size,
        }));
        setTree((prev) => {
          const patch = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map((n) => {
              if (n.path === parent.path && n.type === "dir") {
                return { ...n, children, expanded: !n.expanded };
              }
              if (n.children) return { ...n, children: patch(n.children) };
              return n;
            });
          return patch(prev);
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [client, root],
  );

  const setRoot = useCallback(
    (newRoot: string) => {
      setRootState(newRoot);
      setTree([]);
      setSelectedFile(null);
      setFileContent(null);
    },
    [],
  );

  const toggleDir = useCallback(
    async (node: FileTreeNode) => {
      if (node.expanded) {
        setTree((prev) => {
          const collapse = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map((n) =>
              n.path === node.path ? { ...n, expanded: false } : n.children ? { ...n, children: collapse(n.children) } : n,
            );
          return collapse(prev);
        });
        return;
      }
      setLoading(true);
      await loadChildren(node);
      setLoading(false);
    },
    [loadChildren],
  );

  const selectFile = useCallback(
    async (node: FileTreeNode) => {
      setSelectedFile(node);
      if (!client || !root) return;
      setFileLoading(true);
      setError(null);
      try {
        setFileContent(await client.readFile(root, node.path));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setFileContent(null);
      } finally {
        setFileLoading(false);
      }
    },
    [client, root],
  );

  // 首次加载根目录内容
  useEffect(() => {
    if (!client || !root) return;
    setLoading(true);
    client
      .listDir(root, "")
      .then(({ entries }) => {
        setTree(
          entries.map((e: FsEntry) => ({
            name: e.name,
            path: e.path,
            type: e.type,
            size: e.size,
          })),
        );
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [client, root]);

  return {
    root,
    tree,
    loading,
    error,
    selectedFile,
    fileContent,
    fileLoading,
    setRoot,
    toggleDir,
    selectFile,
  };
}
