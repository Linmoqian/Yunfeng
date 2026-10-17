/* execute 发布的科研快照：关键事实使用胶囊，报告与执行原文默认折叠。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { FlaskConical } from "lucide-react";
import type { ResearchComponentSnapshot } from "../../../services/researchComponent";
import { Capsule, Details, ProgressCapsule } from "../../../components/common";
import styles from "./ResearchMessage.module.css";

export function ResearchReport({ snapshot }: { snapshot: ResearchComponentSnapshot }) {
  const view = snapshot.state;
  const currentResult = snapshot.result?.job_id === view.jobId ? snapshot.result : undefined;
  const evaluation = currentResult?.evaluation;
  const interrupted = currentResult && ["failed", "cancelled", "interrupted"].includes(currentResult.status);
  return <section className={styles.card} data-kind="实验结论" aria-label="实验进展">
    <div className={styles.heading}><FlaskConical size={15} aria-hidden="true" /><span>{view.conclusion ? "实验结论" : "实验进展"}</span></div>
    <div className={styles.metrics} aria-label="关键指标">
      {view.progress && <ProgressCapsule {...view.progress} />}
      {view.metrics.map((m, index) => <Capsule className={styles.metric} value={`${m.value}/${m.unit ?? ""}`} key={`${m.label}-${index}`}>{m.label} {m.value.toLocaleString("zh-CN", { maximumSignificantDigits: 10 })}{m.unit ? ` ${m.unit}` : ""}</Capsule>)}
      {evaluation && <Capsule className={styles.metric} value={String(evaluation.passed)} status={evaluation.passed ? "passed" : "failed"}>{evaluation.passed ? "节点验收通过" : "节点验收未通过"}</Capsule>}
      {!evaluation && interrupted && <Capsule className={styles.metric} status="failed">{currentResult.status === "failed" ? "执行失败" : "执行中断"}</Capsule>}
    </div>
    {view.conclusion && <p className={styles.body}>{view.conclusion.summary}</p>}
    <Details className={styles.method}><div className={`${styles.body} ${styles.reportDetails}`}>
      {view.conclusion?.details && <p className={styles.reportText}>{view.conclusion.details}</p>}
      <p>来源：<code>{view.source}</code></p>
      {evaluation && <p>验收：{evaluation.reason}</p>}
      {currentResult?.output && <pre className={styles.reportOutput}>{currentResult.output}</pre>}
    </div></Details>
  </section>;
}
