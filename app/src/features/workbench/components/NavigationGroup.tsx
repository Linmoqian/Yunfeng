/* 会话分组胶囊与短展开动画，搜索期间自动展示内容。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import styles from "./WorkspaceNavigation.module.css";

export function NavigationReveal({ open, children }: { open: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  return <motion.div initial={false} animate={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
    transition={{ duration: reduced ? 0 : 0.16, ease: "easeOut" }} className={styles.reveal} inert={!open} aria-hidden={!open}>
    <div className={styles.revealContent}>{children}</div>
  </motion.div>;
}

interface NavigationGroupProps {
  label: string; count: number; tone?: string; open: boolean; onToggle: () => void; children: ReactNode;
}
export function NavigationGroup({ label, count, tone, open, onToggle, children }: NavigationGroupProps) {
  const id = useId();
  return <section className={styles.group} aria-label={label}>
    <button type="button" className={styles.groupToggle} data-navigation-group data-tone={tone} aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <ChevronRight size={11} className={styles.chevron} data-open={open} />
      <span className={styles.dot} /><span>{label}</span><span className={styles.count}>{count}</span>
    </button>
    <div id={id}><NavigationReveal open={open}>{children}</NavigationReveal></div>
  </section>;
}
