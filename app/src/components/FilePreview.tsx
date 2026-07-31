import { X } from "lucide-react";
import type { FileTreeNode } from "@/hooks/useFileTree";

interface FilePreviewProps {
  file: FileTreeNode;
  content: string;
  loading: boolean;
  onClose: () => void;
}

/** 文件预览右侧抽屉。 */
export function FilePreview({ file, content, loading, onClose }: FilePreviewProps) {
  return (
    <div className="file-preview">
      <header>
        <strong>{file.name}</strong>
        <button type="button" className="icon-button" title="关闭预览" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <pre>{loading ? "加载中…" : content}</pre>
    </div>
  );
}
