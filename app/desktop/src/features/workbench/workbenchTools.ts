/* LianAgent 工作台模块目录，能力运行由后续服务接入。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { Activity, FilePenLine, FolderOpen, MonitorSmartphone, Terminal, Database, BookOpen, FlaskConical } from "lucide-react";
import { GitCompareArrows } from "lucide-react";
export const WORKBENCH_TOOLS = [
  { id: "evaluation", label: "Agent 评估", description: "同条件比较验收、调用开销与执行路径", icon: GitCompareArrows },
  { id: "terminal", label: "终端", description: "本机 Shell、多会话与交互输入输出", icon: Terminal },
  { id: "resources", label: "资源", description: "图片、视频、文件与分析结果", icon: FolderOpen },
  { id: "resourceMonitor", label: "计算机资源", description: "CPU、内存与运行状态", icon: Activity },
  { id: "devices", label: "设备连接", description: "管理个人设备与连接偏好", icon: MonitorSmartphone },
  { id: "writing", label: "论文文稿", description: "文稿、参考文献、素材与导出", icon: FilePenLine },
  { id: "analysis", label: "数据分析", description: "分析记录、数据摘录与结果核对", icon: Database },
  { id: "literature", label: "文献证据", description: "全文、证据笔记与稳定引用", icon: BookOpen },
  { id: "design", label: "实验设计", description: "研究问题、实验单位、重复与随机化", icon: FlaskConical },
] as const;
export type WorkbenchToolId = (typeof WORKBENCH_TOOLS)[number]["id"];
