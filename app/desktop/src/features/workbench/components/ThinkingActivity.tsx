/* 思考进行时的状态胶囊与按需展开内容。
 * Created on 2026-10-28
 * @author: https://github.com/Linmoqian
 */
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Capsule, MapleCloudLoading } from "../../../components/common";
import styles from "./ThinkingActivity.module.css";

export function ThinkingActivity({ children, defaultOpen }: { children?: ReactNode; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className={styles.activity}>
      <button type="button" className={styles.trigger} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <Capsule tone="accent" animateOnMount={false} status="running">
          <MapleCloudLoading compact />思考中<ChevronDown size={12} aria-hidden="true" className={open ? styles.expanded : undefined} />
        </Capsule>
      </button>
      <div id={panelId} className={styles.content} hidden={!open}>
        {children || <p>暂未收到思考内容。</p>}
      </div>
    </div>
  );
}
