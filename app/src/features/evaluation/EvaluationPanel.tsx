/* 工作台评估入口；读取 agent-eval 产物，不执行导入文件或创建第二份业务状态。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { useCallback, useMemo, useState } from "react";
import { Button, Select, Upload } from "antd";
import { FlaskConical, Upload as UploadIcon } from "lucide-react";
import { Capsule } from "../../components/common";
import { comparisonGroups, parseEvaluationReport } from "./report";
import type { EvaluationReport } from "./types";
import { EvaluationGraph } from "./EvaluationGraph";
import { EvaluationDetails } from "./EvaluationDetails";
import styles from "./Evaluation.module.css";

export function EvaluationPanel() {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [condition, setCondition] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const select = useCallback((id: string | null) => setSelected(id), []);
  const groups = useMemo(() => report ? comparisonGroups(report) : [], [report]);
  const group = groups.find((item) => item.value === condition) ?? groups[0];
  function load(raw: unknown) {
    try { const next = parseEvaluationReport(raw); setReport(next); setCondition(""); setSelected(null); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取报告"); }
  }
  async function example() { load((await import("./fixtures/comparison.json")).default); }
  return <section className={styles.panel} aria-label="Agent 评估">
    <header className={styles.header}><div><span className={styles.eyebrow}>AGENT EVAL</span><h1>Agent 评估</h1><p>同一任务，比较验收与执行开销。</p></div><div className={styles.actions}>
      <Button type="text" size="small" onClick={() => void example()}>载入示例</Button>
      <Upload accept=".json,application/json" showUploadList={false} beforeUpload={(file) => {
        if (file.size > 2 * 1024 * 1024) { setError("报告不能超过 2 MiB"); return false; }
        void file.text().then((value) => { try { load(JSON.parse(value)); } catch { setError("报告不是有效 JSON"); } }).catch(() => setError("文件读取失败"));
        return false;
      }}><Button size="small" icon={<UploadIcon size={14} />}>导入报告</Button></Upload>
    </div></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {report && group ? <>
      <div className={styles.filters}><Select aria-label="评估任务与条件" value={group.value} options={groups.map(({ value, label }) => ({ value, label }))} onChange={(value) => { setCondition(value); setSelected(null); }} />
        <Capsule tone={report.source === "fixture" ? "warning" : "neutral"}>{report.source === "fixture" ? "固定模型替身 · 示例" : "导入评估报告"}</Capsule><Capsule>{group.runs.length} 次运行</Capsule>
      </div>
      {[...new Set(group.runs.map((run) => run.candidate))].some((id) => group.runs.filter((run) => run.candidate === id).length < report.repeats) && <p role="status" className={styles.sampleNote}>部分候选未完成计划的 {report.repeats} 轮，当前只比较已记录样本。</p>}
      {report.source === "fixture" && <p className={styles.sampleNote}>用于体验比较流程，不代表真实模型能力；Token 为替身记录的 0。</p>}
      <div className={styles.body}><EvaluationGraph key={group.value} runs={group.runs} selected={selected} onSelect={select} /><EvaluationDetails runs={group.runs} selected={selected} onSelect={select} /></div>
      <footer className={styles.footer}>按任务与条件分组 · {report.evaluator} · {new Date(report.createdAt).toLocaleString("zh-CN")}<span>报告只读 · 原始文件保留在本机</span></footer>
    </> : <div className={styles.empty}><FlaskConical size={30} strokeWidth={1.3} /><h2>比较一次完整的行动</h2><p>导入 agent-eval 的 JSON 报告，展开各 Agent 的验收、调用与执行路径。</p><Button type="text" onClick={() => void example()}>体验关系图</Button></div>}
  </section>;
}
