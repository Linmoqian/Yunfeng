/* 胶囊只在出现或事实变化时反馈；保持节点稳定，不延迟真实值与键盘操作。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { motionPresets, motionTiming } from "./motion/presets";
import styles from "./Capsule.module.css";

export interface CapsuleProps {
  children: ReactNode;
  className?: string;
  title?: string;
  status?: string;
  value?: string | number;
  animateOnMount?: boolean;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  appearance?: "pill" | "plain";
}

/** value 仅用于识别事实更新，不参与数值插值；重复快照不会重新触发动画。 */
export function Capsule({ children, className, title, status, value, animateOnMount = true, tone = "neutral", appearance = "pill" }: CapsuleProps) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const mounted = useRef(false);
  useEffect(() => {
    const entering = !mounted.current;
    mounted.current = true;
    if (reduced || (entering && !animateOnMount)) controls.set({ opacity: 1, y: 0 });
    else void controls.start({ opacity: [entering ? 0 : 0.65, 1], y: entering ? [3, 0] : 0,
      transition: { ...motionPresets.enter, duration: entering ? motionTiming.enter : motionTiming.feedback } });
    return () => controls.stop();
  }, [animateOnMount, controls, reduced, value]);
  return <motion.span initial={reduced || !animateOnMount ? false : { opacity: 0, y: 3 }} animate={controls} className={`${appearance === "pill" ? styles.capsule : ""} ${className ?? ""}`} title={title} data-status={status} data-tone={tone}>{children}</motion.span>;
}
