/* 科研消息的轻量分类呈现，展示原文，方法按需展开，授权步骤完整可见。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Collapse } from "antd";
import { CircleCheck, ClipboardList, FlaskConical, Info, TriangleAlert } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { summarizeConclusion } from "../researchConclusion";
import styles from "./ResearchMessage.module.css";

const kinds = {
  实验结论: { label: "结论", icon: FlaskConical },
  研究完成: { label: "已完成", icon: CircleCheck },
  需要处理: { label: "需要处理", icon: TriangleAlert },
  计划: { label: "计划", icon: ClipboardList },
  方式: { label: "方式", icon: Info },
} as const;

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{text}</ReactMarkdown>;
}

/** 只识别现有 Runtime 前缀，未识别正文继续按 Markdown 展示。 */
export function ResearchMessage({ text }: { text: string }) {
  const match = /^(实验结论|研究完成|需要处理|计划|方式)：/.exec(text);
  if (!match) return <Markdown text={text} />;
  const kind = match[1] as keyof typeof kinds;
  const { label, icon: Icon } = kinds[kind];
  const body = text.slice(match[0].length).trim();
  // 兼容旧反思中明确位于实测结果之前的执行描述，不推断或改写指标。
  const marker = kind === "实验结论" ? /实测结果：|脚本实测/.exec(body) : null;
  const prefix = marker ? body.slice(0, marker.index).trim() : "";
  const separateMethod = prefix && /写入|运行/.test(prefix) && !/风险|失败|限制|需|假设|未|待|错误|异常|不确定/.test(prefix);
  const summary = kind === "实验结论" ? summarizeConclusion(body) : null;
  const compact = Boolean(summary?.metrics.length);
  return <section className={styles.card} data-kind={kind} aria-label={label}>
    <div className={styles.heading}><Icon size={15} aria-hidden="true" /><span>{label}</span></div>
    {compact ? <>
      <div className={styles.metrics} aria-label="关键指标">{summary!.metrics.map((metric) => <span key={metric.text} className={styles.metric} data-status={metric.status}>{metric.text}</span>)}</div>
      {summary!.notices.map((notice, index) => <div className={styles.body} key={index}><Markdown text={notice} /></div>)}
    </> : <div className={styles.body}><Markdown text={separateMethod ? body.slice(marker!.index) : body} /></div>}
    {(compact || separateMethod) && <Collapse ghost size="small" className={styles.method} items={[{
      key: "method", label: compact ? "详细过程" : "方式", children: <div className={styles.body}><Markdown text={compact ? body : prefix} /></div>,
    }]} />}
  </section>;
}

type Step = { action: "write_file"; path: string; content: string } | { action: "run_command"; program: string; args: string[] }
  | { action: "update_component"; component: "research"; patch: { source: string } };
type Condition = { kind: "file_exists"; path: string } | { kind: "metric"; path: string; key: string; operator: string; value: number };

function parseApproval(message: string): { reason: string; steps: Step[]; condition: Condition } | null {
  const start = message.indexOf("\n\n{");
  if (start < 0) return null;
  try {
    const data = JSON.parse(message.slice(start + 2));
    if (!Array.isArray(data.steps) || !data.steps.every((s: Step) => s && (s.action === "write_file"
      ? typeof s.path === "string" && typeof s.content === "string"
      : s.action === "update_component" ? s.component === "research" && typeof s.patch?.source === "string"
      : s.action === "run_command" && typeof s.program === "string" && Array.isArray(s.args) && s.args.every((arg) => typeof arg === "string")))) return null;
    const c = data.success_condition;
    if (!c || typeof c.path !== "string" || !(c.kind === "file_exists" || (c.kind === "metric" && typeof c.key === "string" && [">", ">=", "<", "<=", "=="].includes(c.operator) && typeof c.value === "number"))) return null;
    return { reason: message.slice(0, start), steps: data.steps, condition: c };
  } catch { return null; }
}

/** 授权计划不折叠副作用；无法识别时保留全部原文供核对。 */
export function ResearchApprovalPlan({ message }: { message: string }) {
  const plan = parseApproval(message);
  if (!plan) return <ResearchMessage text={`计划：${message}`} />;
  const c = plan.condition;
  return <section className={styles.card} aria-label="待确认计划">
    <div className={styles.heading}><ClipboardList size={15} aria-hidden="true" /><span>计划</span></div>
    <div className={styles.body}><Markdown text={plan.reason} /></div>
    <ol className={styles.steps}>{plan.steps.map((step, index) => <li key={index}>{step.action === "write_file"
      ? <><span>写入 <code>{step.path}</code></span><pre>{step.content}</pre></>
      : step.action === "update_component" ? <><span>更新科研组件</span><pre>{JSON.stringify(step.patch, null, 2)}</pre></>
      : <><span>运行</span><pre>{[step.program, ...step.args.map((arg) => JSON.stringify(arg))].join(" ")}</pre></>}
    </li>)}</ol>
    <div className={styles.acceptance}><span>验收</span><code>{c.kind === "file_exists" ? `${c.path} 存在` : `${c.path} · ${c.key} ${c.operator} ${c.value}`}</code></div>
  </section>;
}
