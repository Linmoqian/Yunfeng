import {
  Archive,
  Bug,
  FileText,
  FlaskConical,
  Search,
  Terminal,
  type LucideIcon,
} from "lucide-react";

export type QuickCommand = {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
};

export type AgentStatus = "working" | "online" | "idle";

export type Agent = {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  activity: string;
  accent: string;
};

export type Message = { id: string; role: "user" | "assistant"; text: string };

export type Session = {
  id: string;
  title: string;
  updatedAt: string;
  snippet: string;
  messages: Message[];
};

export const quickCommands: QuickCommand[] = [
  { id: "review", title: "代码审查", subtitle: "检查变更与问题", icon: Search },
  { id: "fix", title: "修复 Bug", subtitle: "定位并修复缺陷", icon: Bug },
  { id: "test", title: "写测试", subtitle: "补充单元测试", icon: FlaskConical },
  { id: "doc", title: "整理文档", subtitle: "沉淀设计文档", icon: FileText },
  { id: "run", title: "运行命令", subtitle: "执行终端指令", icon: Terminal },
  { id: "archive", title: "文件归档", subtitle: "整理工作区文件", icon: Archive },
];

export const agents: Agent[] = [
  {
    id: "lead",
    name: "主管 Agent",
    role: "理解需求、拆解任务",
    status: "working",
    activity: "正在拆解「移动端接入」任务",
    accent: "bg-cyan-400/20 text-cyan-300",
  },
  {
    id: "code",
    name: "代码 Agent",
    role: "编写与修改代码",
    status: "working",
    activity: "生成 yunfeng-mobile 脚手架",
    accent: "bg-blue-400/20 text-blue-300",
  },
  {
    id: "test",
    name: "测试 Agent",
    role: "补充与运行测试",
    status: "online",
    activity: "等待任务分配",
    accent: "bg-emerald-400/20 text-emerald-300",
  },
  {
    id: "doc",
    name: "文档 Agent",
    role: "整理技术文档",
    status: "idle",
    activity: "空闲",
    accent: "bg-amber-400/20 text-amber-300",
  },
  {
    id: "file",
    name: "文件 Agent",
    role: "管理本地文件",
    status: "idle",
    activity: "空闲",
    accent: "bg-violet-400/20 text-violet-300",
  },
  {
    id: "search",
    name: "搜索 Agent",
    role: "检索信息与知识库",
    status: "idle",
    activity: "空闲",
    accent: "bg-pink-400/20 text-pink-300",
  },
];

export const sessions: Session[] = [
  {
    id: "s1",
    title: "yunfeng-mobile 脚手架",
    updatedAt: "刚刚",
    snippet: "已建立 Tauri + Vite + React 移动端工程骨架。",
    messages: [
      { id: "m1", role: "user", text: "在根目录建立 yunfeng-mobile 移动端前端工程。" },
      { id: "m2", role: "assistant", text: "已建立 yunfeng-mobile 目录并提交，技术栈沿用 Tauri 2 + Vite + React。" },
    ],
  },
  {
    id: "s2",
    title: "Marvis 设计调研",
    updatedAt: "10 分钟前",
    snippet: "暗黑科技风 + 快捷指令 + 多 Agent 协作状态。",
    messages: [
      { id: "m3", role: "user", text: "调研腾讯 Marvis 的设计语言。" },
      { id: "m4", role: "assistant", text: "要点：首页对话入口、高频快捷指令卡片、暗黑科技风、多 Agent 协作。" },
    ],
  },
  {
    id: "s3",
    title: "UI 主题收敛",
    updatedAt: "昨天",
    snippet: "锁定移动端暗色主题与设计规范。",
    messages: [],
  },
];
