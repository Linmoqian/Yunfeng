import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTask,
  loadModelCatalog,
  loadTaskSnapshot,
  sendTaskPrompt,
  subscribeRunningSessions,
  type ModelCatalog,
  type ModelSelection,
} from "../../services/taskService";
import { MapleStatusMark } from "./MapleStatusMark";
import { NewTaskDialog } from "./NewTaskDialog";
import { SessionSidebar } from "./SessionSidebar";
import { SettingsDialog, type ThemeMode } from "./SettingsDialog";
import { TaskFocusPanel } from "./TaskFocusPanel";
import {
  buildTaskSections,
  createTaskSummaries,
  type SessionSnapshot,
  type TaskSummary,
} from "./taskPresentation";
import "./workbench.css";

type ConnectionState = "connecting" | "connected" | "offline";

export function WorkbenchPage() {
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
  const [runningSessionIds, setRunningSessionIds] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskSummary | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({ models: [], defaultModel: null });
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelReloadKey, setModelReloadKey] = useState(0);
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(() => {
    const storedModel = window.localStorage.getItem("yunfeng-model");
    if (!storedModel) return null;
    try {
      const parsed = JSON.parse(storedModel) as Partial<ModelSelection>;
      return parsed.provider && parsed.modelId ? { provider: parsed.provider, modelId: parsed.modelId } : null;
    } catch {
      return null;
    }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem("yunfeng-sidebar-collapsed") === "true";
  });
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
  const modelCwd = selectedTask
    ? sessions.find((session) => session.id === selectedTask.id)?.cwd
    : sessions.find((session) => session.cwd)?.cwd;

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
    if (sidebarCollapsed) {
      window.localStorage.setItem("yunfeng-sidebar-collapsed", "true");
    } else {
      window.localStorage.removeItem("yunfeng-sidebar-collapsed");
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (selectedTask && !tasks.some((task) => task.id === selectedTask.id)) {
      setSelectedTask(null);
    }
  }, [selectedTask, tasks]);

  useEffect(() => {
    if (!settingsOpen && !selectedTask) return;
    const controller = new AbortController();
    setModelLoading(true);
    setModelError(null);
    void loadModelCatalog(modelCwd, controller.signal)
      .then((catalog) => {
        setModelCatalog(catalog);
        setModelSelection((current) => {
          if (current && catalog.models.some((model) => model.provider === current.provider && model.id === current.modelId)) {
            return current;
          }
          return catalog.defaultModel;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setModelError(error instanceof Error ? error.message : "模型列表暂时无法读取");
      })
      .finally(() => setModelLoading(false));

    return () => controller.abort();
  }, [modelCwd, modelReloadKey, selectedTask?.id, settingsOpen]);

  async function handleCreateTask(cwd: string, message: string) {
    await createTask(cwd, message, modelSelection);
    await refreshTasks();
  }

  async function handleSendTask(taskId: string, message: string) {
    await sendTaskPrompt(taskId, message);
    await refreshTasks();
  }

  function handleModelChange(nextModel: ModelSelection | null) {
    setModelSelection(nextModel);
    if (nextModel) {
      window.localStorage.setItem("yunfeng-model", JSON.stringify(nextModel));
    } else {
      window.localStorage.removeItem("yunfeng-model");
    }
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}`}>
      <SessionSidebar
        sections={sections}
        taskCount={tasks.length}
        activeTaskId={selectedTask?.id}
        collapsed={sidebarCollapsed}
        onOpenTask={setSelectedTask}
        onNewTask={() => setNewTaskOpen(true)}
      />

      <main className="session-main">
        <header className="workbench-header">
          <div className="session-main__context">
            <button
              className="icon-button sidebar-toggle"
              type="button"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              aria-label={sidebarCollapsed ? "显示会话侧栏" : "隐藏会话侧栏"}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? "显示会话侧栏" : "隐藏会话侧栏"}
            >
              <span aria-hidden="true">{sidebarCollapsed ? "☰" : "‹"}</span>
            </button>
            <div>
              <p className="eyebrow">个人任务工作台</p>
              <span>{selectedTask ? "当前会话" : "全部会话"}</span>
            </div>
          </div>
          <div className="workbench-header__actions">
            <span className={`connection-state connection-state--${connectionState}`}>
              <span className="connection-state__dot" aria-hidden="true" />
              {connectionState === "connected" ? "已同步" : connectionState === "connecting" ? "正在连接" : "状态可能已过期"}
            </span>
            <button className="text-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="打开设置">
              设置
            </button>
          </div>
        </header>

        {connectionState === "offline" && loadError ? (
          <div className="connection-notice" role="status">
            <span>{loadError}</span>
            <button className="text-button" type="button" onClick={() => void refreshTasks()}>重新连接</button>
          </div>
        ) : null}

        {selectedTask ? (
          <TaskFocusPanel
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onSend={handleSendTask}
          />
        ) : (
          <section className="session-overview" aria-labelledby="workbench-title">
            <div className="session-overview__intro">
              <p className="eyebrow">会话工作台</p>
              <h1 id="workbench-title">从一段会话开始。</h1>
              <p>
                左侧保留全部任务的脉络，右侧只展开你正在关注的那一段。Agent 安静地推进，只有真正需要决定的事会靠近你。
              </p>
            </div>
            <div className="session-overview__summary">
              <div>
                <strong>{activeTaskCount}</strong>
                <span>个未完成任务</span>
              </div>
              <div>
                <strong>{tasks.length}</strong>
                <span>段已保存会话</span>
              </div>
            </div>
            {tasks.length === 0 ? (
              <section className="empty-state" aria-live="polite">
                <MapleStatusMark />
                <h2>工作台暂时安静。</h2>
                <p>还没有任务在这里等待。可以从一个清晰的目标开始。</p>
                <button className="button button--primary" type="button" onClick={() => setNewTaskOpen(true)}>
                  新建任务
                </button>
              </section>
            ) : (
              <div className="session-overview__hint">
                <MapleStatusMark />
                <p>从左侧选择一个会话，查看它的状态、模型和下一步。</p>
              </div>
            )}
          </section>
        )}
      </main>

      <NewTaskDialog
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreate={handleCreateTask}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        modelSelection={modelSelection}
        modelOptions={modelCatalog.models}
        modelLoading={modelLoading}
        modelError={modelError}
        onModelChange={handleModelChange}
        onRetryModels={() => setModelReloadKey((value) => value + 1)}
        connectionState={connectionState}
      />
    </div>
  );
}
