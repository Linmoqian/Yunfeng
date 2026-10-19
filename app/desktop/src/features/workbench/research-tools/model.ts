/* 四个研究工具共享素材库，各自保存文稿。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
export type ResearchToolId = 'analysis' | 'literature' | 'design' | 'writing';
export const RESEARCH_TOOLS = [
  { id: 'analysis', label: '数据分析', left: '数据来源', right: '分析成果', placeholder: '记录分析目标、方法与结果核对…' },
  { id: 'literature', label: '文献证据', left: '参考文献', right: '证据笔记', placeholder: '整理研究问题、文献证据与适用范围…' },
  { id: 'design', label: '实验设计', left: '方案提纲', right: '实验资料', placeholder: '记录研究目标、实验单位、重复、随机化与区组…' },
  { id: 'writing', label: '论文文稿', left: '参考文献与章节', right: '图文素材与实验数据', placeholder: '写下研究问题、方法和结果，或从论文提纲开始…' },
] as const;
export const OUTLINES: Record<ResearchToolId, string> = {
  writing: '# 论文标题\n\n## 摘要\n\n## 引言\n\n## 材料与方法\n\n## 结果\n\n## 讨论\n\n## 参考文献\n',
  design: '# 实验方案\n\n## 研究问题与主要终点\n\n## 材料与环境\n\n## 实验单位与重复\n\n## 随机化与区组\n\n## 采集与测量\n\n## 分析方法\n\n## 待确认事项\n',
  literature: '# 文献证据笔记\n\n## 研究问题\n\n## 支持证据\n\n## 相反证据与限制\n',
  analysis: '# 分析记录\n\n## 分析目标\n\n## 数据质量\n\n## 方法与参数\n\n## 结果核对\n',
};
export interface ResearchDocument { name: string; body: string }
export interface Reference { id: string; title: string; citation: string; url: string; notes: string; text?: string; pdfAssetId?: string }
export interface LocalDataFile { id: string; name: string; content: string }
export type ReadingSelection = { kind: 'reference' | 'data'; id: string } | null;
export interface ResearchState extends ResearchDocument {
  analysis?: ResearchDocument; literature?: ResearchDocument; design?: ResearchDocument;
  references?: Reference[]; dataFiles?: LocalDataFile[];
}
export function isResearchTool(id: string): id is ResearchToolId { return RESEARCH_TOOLS.some((tool) => tool.id === id); }
