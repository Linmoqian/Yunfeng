/* 独立验收与执行过程按轮查看，保留失败原因，不展示模型内部思考。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { Select } from "antd";
import { Capsule, Details } from "../../components/common";
import { duration, summarize } from "./report";
import type { EvaluationRun } from "./types";
import styles from "./Evaluation.module.css";
const verdicts = { passed: "验收通过", failed: "未通过", ungraded: "未评分" } as const;

export function EvaluationDetails({ runs, selected, onSelect }: { runs: EvaluationRun[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const chosen = runs.find((run) => run.id === selected);
  const candidate = chosen?.candidate ?? selected?.replace(/^candidate:/, "");
  const samples = runs.filter((run) => run.candidate === candidate);
  if (!samples.length) return <aside className={styles.details}><span className={styles.eyebrow}>观察结果</span><h2>从一个分支开始</h2><p>点击 Agent 铭牌，比较同条件下的验收与开销。</p><p>每一轮均单独保留，失败样本也计入总数。</p></aside>;
  const summary = summarize(samples), run = chosen ?? samples[0];
  return <aside className={styles.details} aria-label="评估结果详情">
    <span className={styles.eyebrow}>{run.model}</span><h2>{run.label}</h2>
    <div className={styles.pills}><Capsule tone={summary.passed === summary.total ? "success" : "warning"}>{summary.passed}/{summary.total} 通过</Capsule><Capsule>中位 {duration(summary.durationMs)}</Capsule>{summary.ungraded > 0 && <Capsule>{summary.ungraded} 次未评分</Capsule>}</div>
    <p className={styles.note}>通过数 / 全部运行；耗时含初始化、执行、验收和清理。</p>
    <Select aria-label="查看评估轮次" value={run.id} onChange={onSelect} options={samples.map((sample) => ({ value: sample.id, label: `第 ${sample.repeat} 轮 · ${verdicts[sample.verdict.status]}` }))} />
    <p className={styles.note}>画布按空间展示当前附近轮次，全部记录可在此切换。</p>
    <div className={styles.verdict}><Capsule tone={run.verdict.status === "passed" ? "success" : run.verdict.status === "ungraded" ? "neutral" : "danger"}>{verdicts[run.verdict.status]}</Capsule><p>{run.verdict.reason}</p></div>
    <dl className={styles.metrics}><div><dt>执行耗时</dt><dd>{duration(run.durationMs)}</dd></div><div><dt>工具调用</dt><dd>{run.toolCalls.length} 次</dd></div><div><dt>模型调用</dt><dd>{run.modelCalls.length} 次</dd></div><div><dt>Token 用量</dt><dd>{run.usage.totalTokens}</dd></div><div><dt>费用</dt><dd>未提供</dd></div></dl>
    {run.error && <p role="alert" className={styles.error}>{run.error}</p>}
    <Details key={run.id} label="查看执行轨迹与最终答案">
      <h3>最终答案</h3><p className={styles.answer}>{run.result?.finalAnswer ?? "没有最终答案"}</p>
      <h3>工具边界</h3>{run.toolCalls.length ? <ol className={styles.trace}>{run.toolCalls.map((call, index) => <li key={index}><strong>{call.name}</strong><span>{duration(call.durationMs)} · {call.status === "succeeded" ? "完成" : "失败"}</span>{call.error && <p>{call.error}</p>}</li>)}</ol> : <p>本轮没有工具调用。</p>}
      <h3>观测记录</h3>{run.result?.trace.steps.filter((step) => step.kind !== "thought").map((step) => <p key={step.index} className={styles.answer}>{step.action?.name ?? step.observation ?? step.error ?? step.kind}</p>)}
    </Details>
  </aside>;
}
