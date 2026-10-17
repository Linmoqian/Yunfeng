/* 状态来自服务租约；过期按离线处理，轻量变化不改变铭牌布局。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { MemberPresence } from "../services/collaborationService";
import { Capsule } from "./Capsule";
import styles from "./TeamMembers.module.css";
const labels = { online: "在线", working: "工作中", idle: "空闲", offline: "离线", unknown: "未知", disabled: "停用" };

export function MemberStatus({ presence, enabled }: { presence?: MemberPresence; enabled: boolean }) {
  const reduced = useReducedMotion();
  const expiry = presence?.expiresAt;
  const [expiredAt, setExpiredAt] = useState<number | null>(null);
  useEffect(() => {
    if (!expiry || expiry <= Date.now()) return;
    const timer = setTimeout(() => setExpiredAt(expiry), expiry - Date.now());
    return () => clearTimeout(timer);
  }, [expiry]);
  const expired = !!expiry && (expiredAt === expiry || expiry <= Date.now());
  const status = !enabled ? "disabled" : expired ? "offline" : presence?.status ?? "unknown";
  return <Capsule className={styles.memberStatus} status={status} value={status} animateOnMount={false} title={status === "unknown" ? "尚未收到状态上报" : labels[status]}>
    <span className={styles.statusSignal} aria-hidden="true">{status === "working" ? [0, 1, 2].map((i) => <motion.i key={i} animate={reduced ? { opacity: 1 } : { opacity: [.35, .9, .35] }} transition={reduced ? { duration: 0 } : { duration: 1.5, repeat: Infinity, delay: i * .18 }} />) : <i />}</span><span>{labels[status]}</span>
  </Capsule>;
}
