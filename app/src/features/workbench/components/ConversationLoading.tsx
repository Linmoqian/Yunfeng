/* 会话读取使用枫叶云朵动画；已有消息继续显示，刷新仅提示轻量状态。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { MapleCloudLoading } from "./MapleCloudLoading";
import styles from "./ConversationLoading.module.css";

export function ConversationLoading({ compact = false }: { compact?: boolean }) {
  return <div className={styles.loading} data-compact={compact || undefined} role="status" aria-label="正在读取会话">
    {compact ? <span className={styles.pill}><MapleCloudLoading compact />读取会话</span>
      : <><MapleCloudLoading /><span className={styles.pill}>读取会话</span></>}
  </div>;
}
