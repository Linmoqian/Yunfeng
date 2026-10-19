/* 枫叶随风落到云朵，随后随云轻浮；仅表达加载，不模拟业务进度。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { motion, useReducedMotion } from "motion/react";
import cloud from "../assets/yunfeng-cloud.png";
import maple from "../assets/maple-mark.png";
import styles from "./MapleCloudLoading.module.css";

export interface MapleCloudLoadingProps { compact?: boolean }
export function MapleCloudLoading({ compact = false }: MapleCloudLoadingProps) {
  const reduced = useReducedMotion();
  return <span className={styles.scene} data-compact={compact || undefined} aria-hidden="true">
    <svg viewBox="0 0 192 112" fill="none" focusable="false">
      <motion.ellipse cx="117" cy="100" rx="34" ry="3" fill="currentColor" initial={false}
        animate={reduced ? { opacity: 0.06 } : { opacity: [0.06, 0.025, 0.06], scaleX: [1, 0.86, 1] }}
        transition={reduced ? { duration: 0 } : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }} />
      {!reduced && <g className={styles.wind} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
        {["M12 49h24c9 0 12-5 18-5", "M23 64h36", "M7 78h20c8 0 10-4 18-4"].map((d, index) =>
          <motion.path key={d} d={d} initial={{ opacity: 0 }} animate={{ x: [0, 24], opacity: [0, 0.4, 0], pathLength: [0.1, 1, 1] }}
            transition={{ duration: 2.4, delay: index * 0.3, repeat: Infinity, repeatDelay: 0.8, ease: "easeOut" }} />)}
      </g>}
      <motion.g initial={false} animate={reduced ? { y: 0, rotate: 0 } : { y: [2, -4, 2], rotate: [-1, 1, -1] }}
        transition={reduced ? { duration: 0 } : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "116px 70px" }}>
        <image href={cloud} x="46" y="-6" width="142" height="142" />
        <motion.g initial={reduced ? false : { x: -102, y: 14, rotate: -48, opacity: 0, scale: 0.7 }}
          animate={reduced ? { x: 0, y: 0, rotate: 8, opacity: 1, scale: 1 } : {
            x: [-102, -65, -26, 2, 0], y: [14, -17, -20, 2, 0], rotate: [-48, 20, -16, 12, 8], opacity: [0, 1, 1, 1, 1], scale: [0.7, 0.9, 1, 1, 1],
          }} transition={{ duration: reduced ? 0 : 1.7, times: [0, 0.28, 0.58, 0.86, 1], ease: "easeInOut" }}
          style={{ transformOrigin: "137px 40px" }}>
          <motion.image href={maple} x="120" y="20" width="34" height="34" initial={false}
            animate={reduced ? { rotate: 0 } : { rotate: [-3, 4, -3] }}
            transition={reduced ? { duration: 0 } : { duration: 3, delay: 1.7, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "137px 48px" }} />
        </motion.g>
      </motion.g>
    </svg>
  </span>;
}
