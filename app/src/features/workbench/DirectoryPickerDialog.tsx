import { Button, Empty, Modal, Spin } from "antd";
import { ArrowUp, Folder, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  browseDirectories,
  type BrowsableDirectory,
} from "../../services/taskService";

interface DirectoryPickerDialogProps {
  open: boolean;
  initialPath?: string;
  onCancel: () => void;
  onSelect: (path: string) => void;
}

export function DirectoryPickerDialog({
  open,
  initialPath,
  onCancel,
  onSelect,
}: DirectoryPickerDialogProps) {
  const [requestedPath, setRequestedPath] = useState<string | undefined>();
  const [currentPath, setCurrentPath] = useState("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<BrowsableDirectory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (open) setRequestedPath(initialPath || undefined);
  }, [initialPath, open]);

  const loadDirectory = useCallback((signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    void browseDirectories(requestedPath, signal)
      .then((result) => {
        setCurrentPath(result.path);
        setParentPath(result.parentPath);
        setDirectories(result.directories);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "无法读取该文件夹");
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, [requestedPath]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    loadDirectory(controller.signal);
    return () => controller.abort();
  }, [loadDirectory, open, reloadKey]);

  return (
    <Modal
      title="选择项目文件夹"
      open={open}
      onCancel={onCancel}
      width={620}
      centered
      className="directory-picker"
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button
          key="select"
          type="primary"
          icon={<FolderOpen size={15} />}
          disabled={!currentPath || loading || Boolean(error)}
          onClick={() => onSelect(currentPath)}
        >
          选择当前文件夹
        </Button>,
      ]}
    >
      <div className="directory-picker__location">
        <Button
          type="text"
          icon={<ArrowUp size={16} />}
          disabled={!parentPath || loading}
          onClick={() => setRequestedPath(parentPath ?? undefined)}
          aria-label="返回上级文件夹"
        />
        <span title={currentPath}>{currentPath || "正在读取…"}</span>
      </div>

      <div className="directory-picker__content" aria-live="polite">
        {loading ? (
          <div className="directory-picker__state"><Spin size="small" /> 正在读取文件夹…</div>
        ) : error ? (
          <div className="directory-picker__state directory-picker__state--error" role="alert">
            <span>{error}</span>
            <Button size="small" onClick={() => setReloadKey((value) => value + 1)}>重新读取</Button>
          </div>
        ) : directories.length > 0 ? (
          <div className="directory-picker__list" role="list" aria-label="子文件夹">
            {directories.map((directory) => (
              <button
                key={directory.path}
                type="button"
                className="directory-picker__item"
                onClick={() => setRequestedPath(directory.path)}
              >
                <Folder size={17} aria-hidden="true" />
                <span>{directory.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前文件夹没有子文件夹" />
        )}
      </div>
    </Modal>
  );
}
