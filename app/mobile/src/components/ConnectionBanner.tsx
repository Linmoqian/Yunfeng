/* 移动端连接提示复用共享胶囊、品牌加载和稳定显示策略。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { RefreshCw } from "lucide-react";
import { Capsule, MapleCloudLoading, useStableVisibility } from "@yunfeng/ui";
import styles from "./ConnectionBanner.module.css";

interface ConnectionBannerProps {
  online: boolean | null;
  onRetry: () => void;
}

/** 只展示真实连接状态，短暂断连不闪现，恢复稳定后收起。 */
export function ConnectionBanner({ online, onRetry }: ConnectionBannerProps) {
  const visible = useStableVisibility(online === false);
  if (!visible) return null;
  return (
    <div className={styles.position} role="status" aria-live="polite">
      <Capsule className={styles.capsule} tone="warning" animateOnMount={false}>
        {online === false && <MapleCloudLoading compact />}
        <span>{online === false ? "正在重新连接" : "连接已恢复"}</span>
        {online === false && <button className={styles.retry} type="button" onClick={onRetry} aria-label="立即重试" title="立即重试">
          <RefreshCw size={14} aria-hidden="true" />
        </button>}
      </Capsule>
    </div>
  );
}
