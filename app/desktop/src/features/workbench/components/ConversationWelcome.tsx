/* 个人 Agent 新会话欢迎页，复用 Yunfeng 原有吉祥物。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Segmented } from "antd";
import { Code2, FlaskConical } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import cloudMascot from "@yunfeng/ui/assets/yunfeng-cloud.png";
import { SESSION_ENTER } from "../workspaceMotion";
import styles from "./ConversationWelcome.module.css";

interface Props { mode: "development" | "research"; onModeChange: (mode: "development" | "research") => void }
export function ConversationWelcome({ mode, onModeChange }: Props) {
  const reduced = useReducedMotion();
  const [keyboard, setKeyboard] = useState(false);
  const instant = Boolean(reduced || keyboard);
  return <section className={styles.welcome} aria-label="新会话欢迎页">
    <img src={cloudMascot} alt="云枫吉祥物" width={112} height={112} />
    <h1>今天想完成什么？</h1>
    <Segmented
      className={styles.modeSelector}
      data-instant={instant || undefined}
      aria-label="工作模式"
      size="large"
      value={mode}
      onChange={onModeChange}
      onPointerDownCapture={() => setKeyboard(false)}
      onKeyDownCapture={() => setKeyboard(true)}
      options={[
        { value: "development", label: <div className={styles.modeLabel}><Code2 size={16} aria-hidden="true" />开发</div> },
        { value: "research", label: <div className={styles.modeLabel}><FlaskConical size={16} aria-hidden="true" />科研</div> },
      ]}
    />
    <div className={styles.descriptions} aria-live="polite" aria-atomic="true">
      {([ ["development", "编写代码、排查问题，或构建应用。"], ["research", "输入研究目标，云枫将自主推进。"] ] as const).map(([value, text]) =>
        <motion.p key={value} initial={false} animate={{ opacity: mode === value ? 1 : 0 }}
          transition={{ ...SESSION_ENTER, duration: instant ? 0 : 0.14 }} aria-hidden={mode !== value}>{text}</motion.p>)}
    </div>
  </section>;
}
