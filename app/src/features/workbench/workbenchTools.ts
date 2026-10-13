/* LianAgent 工作台模块目录，能力运行由后续服务接入。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { Activity, FilePenLine, FolderOpen, MonitorSmartphone } from "lucide-react";
export const WORKBENCH_TOOLS = [
  { id: "resources", label: "资源", description: "图片、视频、文件与分析结果", icon: FolderOpen },
  { id: "resourceMonitor", label: "计算机资源", description: "CPU、内存与运行状态", icon: Activity },
  { id: "devices", label: "设备连接", description: "管理个人设备与连接偏好", icon: MonitorSmartphone },
  { id: "writing", label: "文稿", description: "组织笔记、文稿与参考资料", icon: FilePenLine },
] as const;
export type WorkbenchToolId = (typeof WORKBENCH_TOOLS)[number]["id"];
