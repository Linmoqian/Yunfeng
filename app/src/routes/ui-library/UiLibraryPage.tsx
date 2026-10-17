/* 开发环境的云枫 UI 样例；所有数值均为样例，不调用业务 API。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
import { ArrowLeft, Check, ChevronRight, FlaskConical, GripVertical, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { Capsule, Details, MapleCloudLoading, ProgressCapsule, interactionStyles, dragStyles, useYunfengMotion } from "../../components/common";
import styles from "./UiLibraryPage.module.css";

export function UiLibraryPage() {
  const [completed, setCompleted] = useState(2);
  const [revision, setRevision] = useState(0);
  const { reduced, transition } = useYunfengMotion();
  return <main className={styles.page}>
    <header className={styles.header}><Link to="/" aria-label="返回工作区"><ArrowLeft size={16} /></Link><strong>UI 审阅</strong><Capsule animateOnMount={false}>开发样例</Capsule><button className={interactionStyles.pressable} type="button" onClick={() => { setCompleted(2); setRevision(0); }}>重置样例</button></header>
    <nav className={styles.navigation} aria-label="审阅分区">{[["capsules", "胶囊"], ["progress", "进度"], ["details", "详情"], ["loading", "加载"], ["drag", "拖放"]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
    <div className={styles.grid}>
      <section id="capsules" className={styles.sample}><h2>信息胶囊</h2><div className={styles.row}><Capsule tone="accent"><FlaskConical size={13} />科研</Capsule><Capsule tone="success"><Check size={13} />验收通过</Capsule><Capsule tone="warning">待复核</Capsule><Capsule tone="danger">需要处理</Capsule></div><p>只突出关键事实，颜色传达状态。</p></section>
      <section id="progress" className={styles.sample}><h2>真实进度</h2><div className={styles.row}><ProgressCapsule label="任务" current={completed} total={5} /><ProgressCapsule label="文稿" current={1280} unit="字" /><button className={interactionStyles.pressable} type="button" onClick={() => setCompleted((value) => (value + 1) % 6)}><ChevronRight size={14} />推进</button></div><p>已知总量才显示进度；数值立即更新。</p></section>
      <section id="details" className={styles.sample}><h2>按需展开</h2><Capsule tone="accent" value={revision}>提升 14.4% · 样例</Capsule><Details><p>这里放方法、过程和原始记录。更新胶囊时保留展开状态。</p><button className={interactionStyles.pressable} type="button" onClick={() => setRevision((value) => value + 1)}><RotateCw size={13} />触发反馈</button></Details></section>
      <section id="loading" className={styles.sample}><h2>枫叶与云</h2><div className={styles.row}><MapleCloudLoading compact /><span>正在连接 · 样例</span></div><p>加载不模拟进度。短暂读取不闪现，恢复后稳定收起。</p></section>
      <section id="drag" className={`${styles.sample} ${styles.wide}`}><h2>拖放反馈</h2><div className={styles.dragStates}>
        <div><small>候选</small><div className={`${styles.block} ${dragStyles.target}`} data-candidate="true">可放入的位置</div></div>
        <div><small>虚影与浮起</small><div className={dragStyles.slot} data-source="true"><motion.div className={`${styles.block} ${dragStyles.floating}`} style={{ x: reduced ? 0 : 5, y: reduced ? 0 : -5 }} animate={{ scale: reduced ? 1 : 1.025, rotate: reduced ? 0 : -0.6 }} transition={transition("lift")}><GripVertical size={13} />成员铭牌</motion.div></div></div>
        <div><small>落点预览</small><div className={`${styles.block} ${dragStyles.target}`} data-over="true">直属成员<span className={dragStyles.hint}>放入直属成员</span></div></div>
      </div><p>此处展示视觉状态；真实拖放、权限和关系保存见团队关系图。</p></section>
    </div>
    <footer className={styles.footer}>系统减少动态效果：{reduced ? "已启用" : "未启用"} · Motion / Ant Design / Yunfeng Token</footer>
  </main>;
}
