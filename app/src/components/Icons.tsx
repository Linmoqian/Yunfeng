// 共享图标：集中定义，避免各变体重复 import 具体图标名。
// 图标尺寸/颜色由使用处通过 className 或 size 控制。
import {
  ArrowLeft,
  ArrowRight,
  Command,
  File,
  FileText,
  Folder,
  FolderOpen,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Square,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  FolderTree,
  MessageSquare,
  Cpu,
} from "lucide-react";

export const Icons = {
  ArrowLeft,
  ArrowRight,
  Command,
  File,
  FileText,
  Folder,
  FolderOpen,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Square,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  FolderTree,
  MessageSquare,
  Cpu,
};

export type IconName = keyof typeof Icons;

/** 渲染一个图标（供数据驱动的场景使用）。 */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const Cmp = Icons[name];
  return <Cmp size={size} className={className} />;
}
