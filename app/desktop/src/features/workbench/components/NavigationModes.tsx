/* 个人会话的模式筛选，仅影响列表可见项，不修改会话模式。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { Code2, FlaskConical } from "lucide-react";
import type { TaskSummary } from "../taskPresentation";
import interaction from "./CapsuleInteraction.module.css";
import styles from "./WorkspaceNavigation.module.css";

export type ConversationFilter = "all" | "development" | "research";
interface NavigationModesProps { tasks: TaskSummary[]; value: ConversationFilter; onChange: (value: ConversationFilter) => void }
export function NavigationModes({ tasks, value, onChange }: NavigationModesProps) {
  const options = [{ id: "all", label: "全部" }, { id: "development", label: "开发", icon: Code2 }, { id: "research", label: "科研", icon: FlaskConical }] as const;
  return <div className={styles.modes} role="group" aria-label="会话模式筛选">
    {options.map((option) => {
      const Icon = "icon" in option ? option.icon : undefined;
      const count = option.id === "all" ? tasks.length : tasks.filter((task) => (task.mode ?? "development") === option.id).length;
      return <button type="button" key={option.id} className={interaction.pressable} aria-label={`${option.label}会话 ${count}`}
        aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
        {Icon && <Icon size={12} aria-hidden="true" />}<span>{option.label}</span><span className={styles.count}>{count}</span>
      </button>;
    })}
  </div>;
}
