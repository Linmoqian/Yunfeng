/* 个人 Agent 新会话欢迎页，复用 Yunfeng 原有吉祥物。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { Segmented } from "antd";
import { Code2, FlaskConical } from "lucide-react";
import cloudMascot from "../../../assets/generated/yunfeng-cloud.png";
import styles from "./ConversationWelcome.module.css";

interface Props { mode: "development" | "research"; onModeChange: (mode: "development" | "research") => void }
export function ConversationWelcome({ mode, onModeChange }: Props) {

  return <section className={styles.welcome} aria-label="新会话欢迎页">
    <img src={cloudMascot} alt="云枫吉祥物" width={112} height={112} />
    <h1>今天想完成什么？</h1>
    <Segmented
      className={styles.modeSelector}
      aria-label="工作模式"
      size="large"
      value={mode}
      onChange={onModeChange}
      options={[
        { value: "development", label: <div className={styles.modeLabel}><Code2 size={16} aria-hidden="true" />开发</div> },
        { value: "research", label: <div className={styles.modeLabel}><FlaskConical size={16} aria-hidden="true" />科研</div> },
      ]}
    />
    <p aria-live="polite">{mode === "development"
      ? "编写代码、排查问题，或构建一个应用。"
      : "设定研究目标，自主观察、实验并积累经验。"}</p>
    <span>{mode === "research" ? "在下方输入研究目标，开始自主工作。" : "在下方输入第一条消息，开始与云枫对话。"}</span>
  </section>;
}
