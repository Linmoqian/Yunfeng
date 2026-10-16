/* 共享指针的轻量边框与胶囊；纯视觉提示，允许工程师继续输入和点击。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { MousePointer2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useComponentFocus } from "../hooks/useComponentFocus";
import { useFocusBounds } from "../hooks/useFocusBounds";
import { focusLabels } from "../services/componentFocus";
import styles from "./AgentFocusOverlay.module.css";
export function AgentFocusOverlay() {
  const { focus, error } = useComponentFocus();
  const bounds = useFocusBounds(error ? null : focus);
  const reduced = useReducedMotion();
  if (error) return <div role="status" className={`${styles.label} ${styles.fallback}`}>指针同步失败</div>;
  if (!focus?.target) return null;
  const label = focusLabels[focus.component]?.[focus.target];
  if (!label) return null;
  return <motion.div key={`${focus.component}:${focus.target}`} data-agent-overlay="true" className={bounds ? styles.region : styles.fallback} style={bounds ?? undefined}
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.15 }}>
    <div role="status" className={styles.label}><MousePointer2 size={15} fill="currentColor" aria-hidden="true" /><span>云枫 · {label}{!bounds ? " · 未显示" : ""}</span></div>
  </motion.div>;
}
