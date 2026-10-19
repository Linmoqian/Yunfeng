/* 以真实计数呈现进度；没有总量时只显示当前值，不估算百分比。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { motion } from "motion/react";
import { useYunfengMotion } from "./motion/useYunfengMotion";
import { Capsule } from "./Capsule";
import styles from "./ProgressCapsule.module.css";

export interface ProgressCapsuleProps { label: string; current: number; total?: number; unit?: string; title?: string }
export function ProgressCapsule({ label, current, total, unit, title }: ProgressCapsuleProps) {
  const { transition } = useYunfengMotion();
  if (!Number.isFinite(current) || current < 0 || (total !== undefined && (!Number.isFinite(total) || total <= 0 || current > total))) return null;
  const progress = total === undefined ? undefined : Math.round(current / total * 100);
  // 无总量的文稿计数会随打字高频变化，只在出现时反馈。
  return <Capsule className={styles.capsule} title={title} value={total === undefined ? undefined : `${current}/${total}`}>
    {progress !== undefined && <span className={styles.track} role="progressbar" aria-label={label} aria-valuenow={current} aria-valuemin={0} aria-valuemax={total}><motion.span initial={false} animate={{ scaleX: progress / 100 }} transition={transition("progress")} /></span>}
    <span>{label}</span><span className={styles.value}>{current.toLocaleString("zh-CN")}{total === undefined ? "" : ` / ${total.toLocaleString("zh-CN")}`}{unit ? ` ${unit}` : ""}</span>
  </Capsule>;
}
