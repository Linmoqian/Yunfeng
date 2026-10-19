// 任务看板：主应用同款（Dashi 看板），独立设计 token，在移动端以标签页承载。
import { App as TaskboardApp } from "@/features/taskboard/App";
import "@/features/taskboard/tokens.css";
import "@/features/taskboard/styles.css";
import "@/features/taskboard/taskboard-mobile.css";

export function TaskboardView() {
  return (
    <div className="taskboard-route h-full">
      <TaskboardApp />
    </div>
  );
}
