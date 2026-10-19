/* 紧凑详情入口复用 Ant Design 的折叠、键盘和焦点行为。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { Collapse, ConfigProvider } from "antd";
import { Ellipsis } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { motionTiming } from "./motion/presets";
import { useYunfengMotion } from "./motion/useYunfengMotion";
import styles from "./Details.module.css";
import interaction from "./interaction/feedback.module.css";

export interface DetailsProps { label?: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void }
/** 默认折叠，后续事实更新保留用户展开状态；授权、风险与错误应放在详情之外。 */
export function Details({ label = "详细过程", children, className, defaultOpen = false, onOpenChange }: DetailsProps) {
  const { reduced } = useYunfengMotion();
  const theme = useMemo(() => ({ token: { motion: !reduced, motionDurationSlow: `${motionTiming.enter}s` } }), [reduced]);
  return <ConfigProvider theme={theme}><Collapse ghost size="small" defaultActiveKey={defaultOpen ? ["details"] : []}
    className={`${styles.details} ${interaction.disclosure} ${className ?? ""}`} onChange={(keys) => onOpenChange?.(keys.includes("details"))}
    items={[{ key: "details", showArrow: false, label: <span className={styles.trigger} title={typeof label === "string" ? label : undefined}><Ellipsis size={16} aria-hidden="true" /><span className={styles.accessibleLabel}>{label}</span></span>, children }]} /></ConfigProvider>;
}
