/* 节点胶囊平稳展开与退出；固定占位随画布缩小，避免覆盖相邻节点。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { NodeToolbar, Position, useViewport } from "@xyflow/react";
import type { NodeInfo } from "../researchNodeInfo";
import { SESSION_ENTER, SESSION_EXIT } from "../workspaceMotion";
import { ResearchRelevance, type RelevanceControl } from "./ResearchRelevance";
import { Capsule } from "./Capsule";
import styles from "./ResearchGraph.module.css";

function CapsuleGroup({ below, children }: { below?: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const offset = reduced ? 0 : below ? -3 : 3;
  return <motion.div className={`${styles.satellites} ${below ? styles.below : ""} nodrag nopan`}
    aria-label={below ? "节点实验信息" : "节点概览"} aria-hidden={!present}
    style={{ pointerEvents: present ? "auto" : "none" }}
    initial={reduced ? false : { opacity: 0, y: offset }}
    animate={{ opacity: 1, y: 0, transition: reduced ? { duration: 0 } : SESSION_ENTER }}
    exit={{ opacity: 0, y: offset, transition: reduced ? { duration: 0 } : SESSION_EXIT }}>
    {children}
  </motion.div>;
}

export function ResearchNodeCapsules({ expanded, info, relevance }: { expanded: boolean; info: NodeInfo; relevance?: RelevanceControl }) {
  const { zoom } = useViewport();
  const scale = Math.min(1, zoom);
  // Toolbar 保留到退出动画结束；缩放与动画分别作用，避免覆盖其定位变换。
  return <>
    <NodeToolbar isVisible position={Position.Top} offset={8 * scale}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "bottom center" }}>
        <AnimatePresence>{expanded && <CapsuleGroup key="overview">
          <Capsule animateOnMount={false} className={styles.pill} status={info.passed === undefined ? undefined : info.passed ? "passed" : "failed"}>{info.status}</Capsule>
          {info.progress && <Capsule animateOnMount={false} className={styles.pill} title={info.progress} value={info.progress}>{info.progress}</Capsule>}
          {relevance && <ResearchRelevance value={info.relevance} control={relevance} />}
        </CapsuleGroup>}</AnimatePresence>
      </div>
    </NodeToolbar>
    <NodeToolbar isVisible position={Position.Bottom} offset={8 * scale}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
        <AnimatePresence>{expanded && Boolean(info.metrics.length || info.conclusion) && <CapsuleGroup key="experiment" below>
          {Boolean(info.metrics.length) && <div className={styles.metricRow}>{info.metrics.map((metric) => <Capsule animateOnMount={false} className={styles.pill} title={metric} value={metric} key={metric}>{metric}</Capsule>)}</div>}
          {info.conclusion && <Capsule animateOnMount={false} className={`${styles.pill} ${styles.conclusion}`} title={info.conclusion} value={info.conclusion}>{info.conclusion}</Capsule>}
        </CapsuleGroup>}</AnimatePresence>
      </div>
    </NodeToolbar>
  </>;
}
