/* 个人 Agent 新会话欢迎页，复用 Yunfeng 原有吉祥物。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
import { Segmented } from "antd";
import { Code2, FlaskConical } from "lucide-react";
import cloudMascot from "../../../assets/generated/yunfeng-cloud.png";
import styles from "./ConversationWelcome.module.css";

export function ConversationWelcome() {
  const [mode, setMode] = useState<"development" | "research">("development");

  return <section className={styles.welcome} aria-label="新会话欢迎页">
    <img src={cloudMascot} alt="云枫吉祥物" width={112} height={112} />
    <h1>今天想完成什么？</h1>
    <Segmented
      className={styles.modeSelector}
      aria-label="工作模式"
      size="large"
      value={mode}
      onChange={setMode}
      options={[
        { value: "development", label: <div className={styles.modeLabel}><Code2 size={16} aria-hidden="true" />开发</div> },
        { value: "research", label: <div className={styles.modeLabel}><FlaskConical size={16} aria-hidden="true" />科研</div> },
      ]}
    />
    <p aria-live="polite">{mode === "development"
      ? "编写代码、排查问题，或构建一个应用。"
      : "梳理文献、分析数据，或推进一项研究。"}</p>
    <span>在下方输入第一条消息，开始与云枫对话。</span>
  </section>;
}
