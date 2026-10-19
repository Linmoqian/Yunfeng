/* 开发环境的云枫 UI 样例；所有数值均为样例，不调用业务 API。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
import { ArrowLeft, Check, ChevronRight, FlaskConical, RotateCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Capsule, Details, ProgressCapsule, interactionStyles, useYunfengMotion } from "../../components/common";
import styles from "./UiLibraryPage.module.css";
import { ModeSample, CapsuleSample, QueueSample } from "./InteractionSamples";
import { ConnectionSample } from "./ConnectionSample";
import { ResearchLoopSample } from "./ResearchLoopSample";
import { DragPlayground } from "./DragPlayground";

export function UiLibraryPage() {
  const [completed, setCompleted] = useState(2);
  const [revision, setRevision] = useState(0);
  const [reset, setReset] = useState(0);
  const { reduced } = useYunfengMotion();
  return <main className={styles.page}>
    <header className={styles.header}><Link to="/" aria-label="返回工作区"><ArrowLeft size={16} /></Link><strong>UI 审阅</strong><Capsule animateOnMount={false}>开发样例</Capsule><button className={interactionStyles.pressable} type="button" onClick={() => { setCompleted(2); setRevision(0); setReset((value) => value + 1); }}>重置样例</button></header>
    <nav className={styles.navigation} aria-label="审阅分区">{[["capsules", "胶囊"], ["mode", "模式"], ["research", "科研闭环"], ["queue", "排队"], ["progress", "进度"], ["details", "详情"], ["loading", "加载"], ["drag", "拖放"]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
    <div className={styles.grid}>
      <section id="capsules" className={styles.sample}><h2>信息胶囊</h2><div className={styles.row}><Capsule tone="accent"><FlaskConical size={13} />科研</Capsule><Capsule tone="success"><Check size={13} />验收通过</Capsule><Capsule tone="warning">待复核</Capsule><Capsule tone="danger">需要处理</Capsule></div><CapsuleSample key={reset} /></section>
      <section id="mode" className={styles.sample}><h2>模式切换</h2><ModeSample key={reset} /></section>
      <section id="research" className={`${styles.sample} ${styles.wide}`}><h2>科研闭环</h2><ResearchLoopSample key={reset} /></section>
      <section id="queue" className={`${styles.sample} ${styles.wide}`}><h2>消息排队</h2><QueueSample key={reset} /></section>
      <section id="progress" className={styles.sample}><h2>真实进度</h2><div className={styles.row}><ProgressCapsule label="任务" current={completed} total={5} /><ProgressCapsule label="文稿" current={1280} unit="字" /><button className={interactionStyles.pressable} type="button" onClick={() => setCompleted((value) => (value + 1) % 6)}><ChevronRight size={14} />推进</button></div><p>已知总量才显示进度；数值立即更新。</p></section>
      <section id="details" className={styles.sample}><h2>按需展开</h2><Capsule tone="accent" value={revision}>提升 14.4% · 样例</Capsule><Details><p>这里放方法、过程和原始记录。更新胶囊时保留展开状态。</p><button className={interactionStyles.pressable} type="button" onClick={() => setRevision((value) => value + 1)}><RotateCw size={13} />触发反馈</button></Details></section>
      <section id="loading" className={styles.sample}><h2>重连与加载</h2><ConnectionSample key={reset} /></section>
      <section id="drag" className={`${styles.sample} ${styles.wide}`}><h2>拖放体验</h2><DragPlayground key={reset} /></section>
    </div>
    <footer className={styles.footer}>系统减少动态效果：{reduced ? "已启用" : "未启用"} · Motion / Ant Design / Yunfeng Token</footer>
  </main>;
}
