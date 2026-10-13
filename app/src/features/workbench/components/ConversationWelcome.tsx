/* 个人 Agent 新会话欢迎页，复用 Yunfeng 原有吉祥物。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import cloudMascot from "../../../assets/generated/yunfeng-cloud.png";
import styles from "./ConversationWelcome.module.css";

export function ConversationWelcome() {
  return <section className={styles.welcome} aria-label="新会话欢迎页">
    <img src={cloudMascot} alt="云枫吉祥物" width={112} height={112} />
    <h1>今天想完成什么？</h1>
    <p>整理想法、编写代码，或推进一个任务。</p>
    <span>在下方输入第一条消息，开始与云枫对话。</span>
  </section>;
}
