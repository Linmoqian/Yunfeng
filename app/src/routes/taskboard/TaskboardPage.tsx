import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { App as TaskboardApp } from "../../features/taskboard/App";
import "../../features/taskboard/styles.css";
import styles from "./TaskboardPage.module.css";

export function TaskboardPage() {
  const navigate = useNavigate();

  return (
    <div className="taskboard-route">
      <button
        className={styles.backButton}
        type="button"
        onClick={() => navigate("/")}
        aria-label="返回 Yunfeng 工作台"
        title="返回 Yunfeng 工作台"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        <span>工作台</span>
      </button>
      <TaskboardApp />
    </div>
  );
}
