import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTask,
  loadModelCatalog,
  loadTaskModel,
  loadTaskSnapshot,
  sendTaskPrompt,
  setTaskModel as setTaskModelRequest,
  subscribeRunningSessions,
  type ModelCatalog,
  type ModelSelection,
} from "../../services/taskService";
import { MapleStatusMark } from "./MapleStatusMark";
import { NewTaskDialog } from "./NewTaskDialog";
import { SettingsDialog, type ThemeMode } from "./SettingsDialog";
import { TaskFocusPanel } from "./TaskFocusPanel";
import { TaskSection } from "./TaskSection";
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
  const [activeTaskModel, setActiveTaskModel] = useState<ModelSelection | null>(null);
  const [activeTaskModelLoading, setActiveTaskModelLoading] = useState(false);
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

  useEffect(() => {
    const taskId = selectedTask?.id;
    if (!taskId) {
      setActiveTaskModel(null);
      setActiveTaskModelLoading(false);
      return;
    }

    const controller = new AbortController();
    setActiveTaskModel(null);
    setActiveTaskModelLoading(true);
    void loadTaskModel(taskId, controller.signal)
      .then(setActiveTaskModel)
      .catch(() => setActiveTaskModel(null))
      .finally(() => setActiveTaskModelLoading(false));

    return () => controller.abort();
  }, [selectedTask?.id]);

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

  async function handleActiveTaskModelChange(taskId: string, nextModel: ModelSelection) {
    const appliedModel = await setTaskModelRequest(taskId, nextModel);
    setActiveTaskModel(appliedModel);
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
          <button className="text-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="打开设置">
            设置
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
        model={activeTaskModel}
        modelOptions={modelCatalog.models}
        modelLoading={modelLoading || activeTaskModelLoading}
        modelError={modelError}
        onModelChange={handleActiveTaskModelChange}
      />
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
