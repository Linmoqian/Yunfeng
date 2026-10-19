/* 科研闭环审阅样例：事件唤醒、单步或自动推进、暂停恢复与节点详情。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useReducer, useState } from "react";
import { motion } from "motion/react";
import { Bell, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { Capsule, Details, ProgressCapsule, interactionStyles, useYunfengMotion } from "../../components/common";
import { initialResearchSample, researchSampleReducer, samplePhaseLabels } from "./researchSampleState";
import styles from "./ResearchLoopSample.module.css";
import { ToolFeedback } from "../../features/workbench/components/ToolFeedback";
import type { ToolCallInfo } from "../../features/workbench/toolFeedback";

const nodes = [{ title: "源码压缩优化", summary: "比较压缩参数，核对字节一致性。" }, { title: "建立基线", summary: "测量 level 1 的压缩结果。" }, { title: "优化与验证", summary: "比较 level 9 与基线的差距。" }];
export function ResearchLoopSample() {
  const [state, dispatch] = useReducer(researchSampleReducer, initialResearchSample);
  const [inspected, setInspected] = useState<number | null>(null);
  const { reduced, transition } = useYunfengMotion();
  const running = !["waiting", "complete"].includes(state.phase);
  const current = state.phase === "complete" ? 0 : state.round + 1;
  const selected = inspected ?? current;
  useEffect(() => {
    if (!state.automatic || state.paused || !running) return;
    const timer = setTimeout(() => dispatch({ type: "next" }), 1500);
    return () => clearTimeout(timer);
  }, [state.automatic, state.paused, state.phase, state.progress, running]);
  function nodeStatus(index: number) {
    if (index === 0) return state.phase === "complete" ? "目标达成" : "研究目标";
    if (index <= state.finished) return "验收通过";
    return index === current && running ? "进行中" : "待执行";
  }
  const phase = state.paused ? "已暂停" : samplePhaseLabels[state.phase];
  const showTools = state.phase !== "waiting" || state.finished > 0;
  const executing = state.phase === "execute";
  const sampleCalls: ToolCallInfo[] = showTools ? [
    { callId: "sample-read", name: "read", ...(state.phase !== "observe" ? { finishedAt: "sample", outcome: "succeeded" as const } : state.paused ? { finishedAt: "sample", outcome: "unknown" as const } : {}) },
    ...(["execute", "reflect", "complete", "waiting"].includes(state.phase) ? [
      { callId: "sample-modify", name: "modify", finishedAt: "sample", outcome: "succeeded" as const },
      { callId: "sample-terminal", name: "terminal", ...(!executing ? { finishedAt: "sample", outcome: "succeeded" as const } : state.paused ? { finishedAt: "sample", outcome: "unknown" as const } : {}) },
    ] : []),
  ] : [];
  return <>
    <div className={styles.toolbar}>
      <button type="button" className={interactionStyles.pressable} disabled={state.paused || state.phase !== "waiting"} onClick={() => dispatch({ type: "hook" })}><Bell size={13} />Hook 唤醒</button>
      <button type="button" className={interactionStyles.pressable} disabled={state.paused || !running} onClick={() => dispatch({ type: "next" })}><ChevronRight size={13} />下一步</button>
      <button type="button" className={interactionStyles.pressable} aria-pressed={state.automatic} disabled={state.phase === "complete"} onClick={() => dispatch({ type: "automatic" })}>自动推进</button>
      <button type="button" className={interactionStyles.pressable} disabled={state.phase === "complete"} onClick={() => dispatch({ type: state.paused ? "resume" : "pause" })}>{state.paused ? <Play size={13} /> : <Pause size={13} />}{state.paused ? "继续" : "暂停"}</button>
      <button type="button" className={interactionStyles.pressable} aria-label="重置科研演示" title="重置演示" onClick={() => { dispatch({ type: "reset" }); setInspected(null); }}><RotateCcw size={13} /></button>
    </div>
    <div className={styles.status} role="status" aria-live="polite">
      <Capsule tone={state.paused ? "warning" : state.phase === "complete" ? "success" : "accent"} value={phase}>{phase}</Capsule>
      <ProgressCapsule label="实验" current={state.finished} total={2} />
      <Capsule value={state.hooks}>Hook {state.hooks}</Capsule>
      <span>本地模拟 · 不执行命令或调用模型</span>
    </div>
    <div className={styles.graph} role="group" aria-label="科研演示关系图">
      <svg className={styles.lines} viewBox="0 0 720 50" preserveAspectRatio="none" aria-hidden="true"><path d="M360 0 V25 H171 V50 M360 25 H549 V50" /></svg>
      {nodes.map((node, index) => <motion.div key={node.title} className={`${styles.node} ${index === 0 ? styles.mission : ""}`} data-current={current === index} data-selected={selected === index} data-complete={index > 0 && index <= state.finished || index === 0 && state.phase === "complete"}
        initial={false} animate={{ opacity: index > 0 && index !== current && index > state.finished ? 0.6 : 1 }} transition={transition("feedback")}>
        <button type="button" aria-label={`查看${node.title}`} aria-pressed={selected === index} onClick={() => setInspected((previous) => previous === index ? null : index)}><strong>{node.title}</strong><small>{node.summary}</small></button>
      </motion.div>)}
    </div>
    <div className={styles.nodeInfo} aria-label="科研节点信息">
      <span>{nodes[selected].title}</span><Capsule tone={nodeStatus(selected).includes("通过") || nodeStatus(selected) === "目标达成" ? "success" : "neutral"} value={nodeStatus(selected)}>{nodeStatus(selected)}</Capsule>
      {selected === current && state.phase === "execute" && <ProgressCapsule label="作业" current={state.progress} total={2} />}
      {selected === 1 && state.finished >= 1 && <Capsule>基线 24,426 字节</Capsule>}
      {(selected === 2 && state.finished === 2 || selected === 0 && state.phase === "complete") && <><Capsule tone="accent">缩小 14.4%</Capsule><Capsule>解压一致</Capsule></>}
    </div>
    <div className={styles.summary} aria-live="polite">{state.paused ? `已保留${samplePhaseLabels[state.phase]}阶段，继续后从原处推进。` : state.phase === "waiting" ? state.round === 0 ? "等待数据就绪事件，点击 Hook 唤醒。" : "基线已记录，等待复核事件；再次点击 Hook 唤醒。" : state.phase === "complete" ? "样例结论：压缩体积缩小 14.4%，解压字节一致。" : `${nodes[current].title} · ${samplePhaseLabels[state.phase]}${state.phase === "execute" ? ` ${state.progress}/2` : ""}`}</div>
    <ToolFeedback calls={sampleCalls} />
    <Details label="科研演示过程"><ol className={styles.log}>{state.log.map((entry, index) => <li key={index}>{entry}</li>)}</ol></Details>
    {reduced && <small className={styles.reduced}>已按系统设置减少动态效果。</small>}
  </>;
}
