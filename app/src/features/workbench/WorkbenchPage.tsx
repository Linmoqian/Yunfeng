import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTask,
  loadTaskSnapshot,
  sendTaskPrompt,
  subscribeRunningSessions,
} from "../../services/taskService";
import { MapleStatusMark } from "./MapleStatusMark";
import { NewTaskDialog } from "./NewTaskDialog";
import { TaskFocusPanel } from "./TaskFocusPanel";
import { TaskSection } from "./TaskSection";
import {
  buildTaskSections,
  createTaskSummaries,
  type SessionSnapshot,
  type TaskSummary,
} from "./taskPresentation";
import "./workbench.css";

type ThemeMode = "system" | "light" | "dark";
type ConnectionState = "connecting" | "connected" | "offline";

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色主题",
  dark: "深色主题",
};

export function WorkbenchPage() {
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
  const [runningSessionIds, setRunningSessionIds] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskSummary | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const storedTheme = window.localStorage.getItem("yunfeng-theme");
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  });

  const tasks = useMemo(
    () => createTaskSummaries(sessions, runningSessionIds),
    [runningSessionIds, sessions],
  );
  const sections = useMemo(() => buildTaskSections(tasks), [tasks]);
  const activeTaskCount = tasks.filter((task) => task.section !== "completed").length;
  const themeLabel = THEME_LABELS[themeMode];

  const refreshTasks = useCallback(async () => {
    try {
      const snapshot = await loadTaskSnapshot();
      setSessions(snapshot.sessions);
      setRunningSessionIds(snapshot.runningSessionIds);
      setLoadError(null);
      setConnectionState("connected");
    } catch (error) {
      setConnectionState("offline");
      setLoadError(error instanceof Error ? error.message : "任务状态暂时无法读取");
    }
  }, []);

  useEffect(() => {
    void refreshTasks();
    return subscribeRunningSessions(
      (nextRunningSessionIds) => setRunningSessionIds(nextRunningSessionIds),
      (connected) => setConnectionState(connected ? "connected" : "offline"),
    );
  }, [refreshTasks]);

  useEffect(() => {
    if (themeMode === "system") {
      document.documentElement.removeAttribute("data-theme");
      window.localStorage.removeItem("yunfeng-theme");
    } else {
      document.documentElement.dataset.theme = themeMode;
      window.localStorage.setItem("yunfeng-theme", themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    if (selectedTask && !tasks.some((task) => task.id === selectedTask.id)) {
      setSelectedTask(null);
    }
  }, [selectedTask, tasks]);

  function cycleTheme() {
    setThemeMode((current) => {
      if (current === "system") return "light";
      if (current === "light") return "dark";
      return "system";
    });
  }

  async function handleCreateTask(cwd: string, message: string) {
    await createTask(cwd, message);
    await refreshTasks();
  }

  async function handleSendTask(taskId: string, message: string) {
    await sendTaskPrompt(taskId, message);
    await refreshTasks();
  }

  return (
    <div className="app-shell">
      <header className="workbench-header">
        <a className="wordmark" href="/" aria-label="Yunfeng 工作台">
          <MapleStatusMark />
          <span>Yunfeng</span>
        </a>
        <div className="workbench-header__actions">
          <span className={`connection-state connection-state--${connectionState}`}>
            <span className="connection-state__dot" aria-hidden="true" />
            {connectionState === "connected" ? "已同步" : connectionState === "connecting" ? "正在连接" : "状态可能已过期"}
          </span>
          <button className="text-button" type="button" onClick={cycleTheme} aria-label={`切换主题，当前为${themeLabel}`}>
            {themeLabel}
          </button>
          <button className="button button--primary" type="button" onClick={() => setNewTaskOpen(true)}>
            新建任务
          </button>
        </div>
      </header>

      <main className="workbench-main">
        <section className="workbench-intro" aria-labelledby="workbench-title">
          <div>
            <p className="eyebrow">个人任务工作台</p>
            <h1 id="workbench-title">让需要你的事先浮现。</h1>
            <p className="workbench-intro__description">
              全部任务保持在同一片视野里，Agent 安静地推进，只有真正需要决定的事会靠近你。
            </p>
          </div>
          <p className="workbench-intro__summary">
            <strong>{activeTaskCount}</strong>
            <span>个未完成任务</span>
          </p>
        </section>

        {connectionState === "offline" && loadError ? (
          <div className="connection-notice" role="status">
            <span>{loadError}</span>
            <button className="text-button" type="button" onClick={() => void refreshTasks()}>重新连接</button>
          </div>
        ) : null}

        {sections.length > 0 ? (
          <div className="task-sections">
            {sections.map((section) => (
              <TaskSection key={section.id} section={section} onOpenTask={setSelectedTask} />
            ))}
          </div>
        ) : (
          <section className="empty-state" aria-live="polite">
            <MapleStatusMark />
            <h2>工作台暂时安静。</h2>
            <p>还没有任务在这里等待。可以从一个清晰的目标开始。</p>
            <button className="button button--primary" type="button" onClick={() => setNewTaskOpen(true)}>
              新建任务
            </button>
          </section>
        )}
      </main>

      <TaskFocusPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSend={handleSendTask}
      />
      <NewTaskDialog
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreate={handleCreateTask}
      />
    </div>
  );
}
