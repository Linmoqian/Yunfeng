/* 自动重连状态胶囊：延迟出现、稳定收起，浮层不改变会话布局。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Popover } from "antd";
import { CircleAlert, RotateCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MapleCloudLoading } from "./MapleCloudLoading";
import styles from "./ConnectionCapsule.module.css";

export function ConnectionCapsule({ busy, error, onRetry }: { busy: boolean; error?: string | null; onRetry: () => void }) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (error || (busy && visible)) return;
    const timer = setTimeout(() => {
      if (busy) { shownAt.current = Date.now(); setVisible(true); }
      else setVisible(false);
    }, busy ? 600 : Math.max(400, 1200 - (Date.now() - shownAt.current)));
    return () => clearTimeout(timer);
  }, [busy, error, visible]);
  return <div className={styles.anchor}>
    <AnimatePresence initial={false}>
      {(error || visible) && <motion.div key="connection" className={styles.capsule} data-error={Boolean(error) || undefined}
        initial={reduced ? false : { opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -2 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        {error ? <Popover trigger="click" placement="bottom" content={<div className={styles.detail}><span>{error}</span><button type="button" onClick={onRetry}><RotateCw size={13} />重试连接</button></div>}>
          <button type="button" className={styles.errorButton} aria-label="查看连接异常"><CircleAlert size={13} />连接异常</button>
        </Popover> : <span className={styles.status} role="status" aria-live="polite"><MapleCloudLoading compact />正在自动重连</span>}
      </motion.div>}
    </AnimatePresence>
  </div>;
}
