import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  createTask,
  loadLegacySessions,
  loadModelCatalog,
  loadTasks,
  renameTask,
  sendTaskCommand,
  subscribeTaskSummary,
  type ModelCatalog,
  type ModelSelection,
  type SessionSnapshot,
  type TaskState,
  type TaskStreamEvent,
} from "../../services/taskService";
import { MapleStatusMark } from "./MapleStatusMark";
import { NewTaskDialog } from "./NewTaskDialog";
import { SessionSidebar } from "./SessionSidebar";
import { SettingsDialog, type ThemeMode } from "./SettingsDialog";
import { TaskFocusPanel } from "./TaskFocusPanel";
import {
  buildTaskSections,
  collectProjects,
  sessionToLegacySummary,
  taskToSummary,
  type TaskSummary,
} from "./taskPresentation";
import "./workbench.css";

type ConnectionState = "connecting" | "connected" | "offline";

type ArchivedFilter = "all" | "active" | "archived";

interface WorkbenchState {
  tasks: TaskState[];
  sessions: SessionSnapshot[];
  currentTaskId: string | null;
  currentSessionId: string | null;
  connectionState: ConnectionState;
  loadError: string | null;
  search: string;
  projectFilter: string;
  archivedFilter: ArchivedFilter;
  attentionCount: number;
}

type WorkbenchAction =
  | { type: "snapshot"; tasks: TaskState[]; sessions: SessionSnapshot[] }
  | { type: "taskUpdated"; task: TaskState }
  | { type: "taskRemoved"; taskId: string }
  | { type: "selectTask"; taskId: string | null }
  | { type: "selectSession"; sessionId: string | null }
  | { type: "connection"; state: ConnectionState; error?: string | null }
  | { type: "search"; value: string }
  | { type: "project"; value: string }
  | { type: "archived"; value: ArchivedFilter };

const initialState: WorkbenchState = {
  tasks: [],
  sessions: [],
  currentTaskId: null,
  currentSessionId: null,
  connectionState: "connecting",
  loadError: null,
  search: "",
  projectFilter: "",
  archivedFilter: "active",
  attentionCount: 0,
};

function getInitialSelection(): { taskId: string | null; sessionId: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { taskId: params.get("task"), sessionId: params.get("session") };
}

function reducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case "snapshot":
      return {
        ...state,
        tasks: action.tasks,
        sessions: action.sessions,
        attentionCount: action.tasks.filter((t) => t.status === "failed" || t.status === "waiting_approval").length,
      };
    case "taskUpdated": {
      const task = action.task;
      const exists = state.tasks.some((t) => t.id === task.id);
      const tasks = exists
        ? state.tasks.map((t) => (t.id === task.id ? task : t))
        : [...state.tasks, task];
      return {
        ...state,
        tasks,
        attentionCount: tasks.filter((t) => t.status === "failed" || t.status === "waiting_approval").length,
      };
    }
    case "taskRemoved":
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.taskId),
        ...(state.currentTaskId === action.taskId ? { currentTaskId: null } : {}),
      };
    case "selectTask":
      return { ...state, currentTaskId: action.taskId, currentSessionId: action.taskId ? null : state.currentSessionId };
    case "selectSession":
      return { ...state, currentSessionId: action.sessionId, currentTaskId: action.sessionId ? null : state.currentTaskId };
    case "connection":
      return { ...state, connectionState: action.state, loadError: action.error !== undefined ? action.error : state.loadError };
    case "search":
      return { ...state, search: action.value };
    case "project":
      return { ...state, projectFilter: action.value };
    case "archived":
      return { ...state, archivedFilter: action.value };
    default:
      return state;
  }
}

function syncUrl(state: WorkbenchState): void {
  const params = new URLSearchParams();
  if (state.currentTaskId) params.set("task", state.currentTaskId);
  if (state.currentSessionId) params.set("session", state.currentSessionId);
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  if (window.location.pathname + window.location.search !== next) {
    window.history.replaceState(null, "", next);
  }
}

export function WorkbenchPage() {
  const [state, dispatch] = useReducer(reducer, initialState, (initial) => ({
    ...initial,
    ...getInitialSelection(),
  }));
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

  // 派生：当前任务 / 当前会话 / 分组 / 项目列表
  const currentTask = state.currentTaskId
    ? state.tasks.find((task) => task.id === state.currentTaskId) ?? null
    : null;
  const currentSession = state.currentSessionId
    ? state.sessions.find((session) => session.id === state.currentSessionId) ?? null
    : null;

  const allSummaries = useMemo(() => {
    const taskSummaries = state.tasks.map(taskToSummary);
    const legacySummaries = state.sessions
      .filter((session) => !state.tasks.some((task) => task.sessionId === session.id))
      .map(sessionToLegacySummary);
    return [...taskSummaries, ...legacySummaries];
  }, [state.sessions, state.tasks]);

  const filteredSummaries = useMemo(() => {
    const needle = state.search.trim().toLowerCase();
    return allSummaries.filter((task) => {
      if (state.projectFilter && task.projectName !== state.projectFilter) return false;
      if (state.archivedFilter === "archived" && task.section !== "archived") return false;
      if (state.archivedFilter === "active" && task.section === "archived") return false;
      if (needle) {
        return (
          task.title.toLowerCase().includes(needle) ||
          task.currentAction.toLowerCase().includes(needle) ||
          task.cwd.toLowerCase().includes(needle)
        );
      }
      return true;
    });
  }, [allSummaries, state.archivedFilter, state.projectFilter, state.search]);

  const sections = useMemo(
    () => buildTaskSections(filteredSummaries, state.archivedFilter === "all" || state.archivedFilter === "archived"),
    [filteredSummaries, state.archivedFilter],
  );
  const projects = useMemo(() => collectProjects(allSummaries), [allSummaries]);
  const activeTaskCount = state.tasks.filter((task) => task.status !== "completed" && task.status !== "archived").length;

  const modelCwd = currentTask?.cwd || currentSession?.cwd || state.tasks.find((task) => task.cwd)?.cwd;

  const refreshSnapshot = useCallback(async () => {
    try {
      const [taskResult, sessions] = await Promise.all([
        loadTasks({ limit: 500 }),
        loadLegacySessions(),
      ]);
      dispatch({ type: "snapshot", tasks: taskResult.tasks, sessions });
      dispatch({ type: "connection", state: "connected", error: null });
    } catch (error) {
      dispatch({
        type: "connection",
        state: "offline",
        error: error instanceof Error ? error.message : "任务状态暂时无法读取",
      });
    }
  }, []);

  useEffect(() => {
    void refreshSnapshot();
    return subscribeTaskSummary(
      (event: TaskStreamEvent) => {
        if (event.type === "task_snapshot" && Array.isArray(event.tasks)) {
          dispatch({ type: "snapshot", tasks: event.tasks as TaskState[], sessions: state.sessions });
          return;
        }
        if (event.type === "task_updated" && event.taskId && isTaskStateLike(event.data)) {
          dispatch({ type: "taskUpdated", task: event.data as TaskState });
        }
      },
      (connected) => dispatch({ type: "connection", state: connected ? "connected" : "offline" }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步 URL 深链接
  useEffect(() => {
    syncUrl(state);
  }, [state.currentTaskId, state.currentSessionId]);

  // popstate：浏览器前进后退恢复选择
  useEffect(() => {
    const onPopState = () => {
      const { taskId, sessionId } = getInitialSelection();
      if (taskId) dispatch({ type: "selectTask", taskId });
      else if (sessionId) dispatch({ type: "selectSession", sessionId });
      else {
        dispatch({ type: "selectTask", taskId: null });
        dispatch({ type: "selectSession", sessionId: null });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 主题
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

  // 模型目录
  useEffect(() => {
    if (!settingsOpen && !currentTask) return;
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
  }, [modelCwd, modelReloadKey, currentTask?.id, settingsOpen]);

  async function handleCreateTask(cwd: string, message: string) {
    const { task } = await createTask(cwd, message, modelSelection);
    // 新任务创建成功：立即进入对应任务（不再忽略返回 ID）
    dispatch({ type: "taskUpdated", task });
    dispatch({ type: "selectTask", taskId: task.id });
    await refreshSnapshot();
  }

  async function handleRename(taskId: string, name: string) {
    const updated = await renameTask(taskId, name);
    dispatch({ type: "taskUpdated", task: updated });
  }

  async function handleArchive(taskId: string) {
    await sendTaskCommand(taskId, { type: "archive" });
    await refreshSnapshot();
  }

  async function handleReopen(taskId: string) {
    await sendTaskCommand(taskId, { type: "reopen" });
    await refreshSnapshot();
  }

  function handleOpenTask(task: TaskSummary) {
    if (task.isLegacy) {
      dispatch({ type: "selectSession", sessionId: task.sessionId });
    } else {
      dispatch({ type: "selectTask", taskId: task.id });
    }
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
        taskCount={state.tasks.length}
        attentionCount={state.attentionCount}
        activeTaskId={currentTask?.id ?? currentSession?.id}
        collapsed={sidebarCollapsed}
        search={state.search}
        onSearch={(value) => dispatch({ type: "search", value })}
        projectFilter={state.projectFilter}
        projects={projects}
        onProjectFilter={(value) => dispatch({ type: "project", value })}
        archivedFilter={state.archivedFilter}
        onArchivedFilter={(value) => dispatch({ type: "archived", value })}
        onOpenTask={handleOpenTask}
        onNewTask={() => setNewTaskOpen(true)}
        onRename={handleRename}
        onArchive={handleArchive}
        onReopen={handleReopen}
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
              <p className="eyebrow">Yunfeng 工作台</p>
              <span>{currentTask || currentSession ? "当前任务" : "全部任务"}</span>
            </div>
          </div>
          <div className="workbench-header__actions">
            <span className={`connection-state connection-state--${state.connectionState}`}>
              <span className="connection-state__dot" aria-hidden="true" />
              {state.connectionState === "connected" ? "已同步" : state.connectionState === "connecting" ? "正在连接" : "状态可能已过期"}
            </span>
            <button className="text-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="打开设置">
              设置
            </button>
          </div>
        </header>

        {state.connectionState === "offline" && state.loadError ? (
          <div className="connection-notice" role="status">
            <span>{state.loadError}</span>
            <button className="text-button" type="button" onClick={() => void refreshSnapshot()}>重新连接</button>
          </div>
        ) : null}

        {currentTask ? (
          <TaskFocusPanel
            task={currentTask}
            onClose={() => dispatch({ type: "selectTask", taskId: null })}
            onTaskUpdated={(task) => dispatch({ type: "taskUpdated", task })}
          />
        ) : currentSession ? (
          <TaskFocusPanel
            legacySession={currentSession}
            onClose={() => dispatch({ type: "selectSession", sessionId: null })}
            onTaskUpdated={(task) => {
              dispatch({ type: "taskUpdated", task });
              dispatch({ type: "selectTask", taskId: task.id });
            }}
          />
        ) : (
          <section className="session-overview" aria-labelledby="workbench-title">
            <div className="session-overview__intro">
              <p className="eyebrow">任务工作台</p>
              <h1 id="workbench-title">管理编码任务。</h1>
              <p>
                任务由后端领域状态驱动：运行、等待继续、等待审批、失败与完成都以真实状态为准。
                旧会话保留浏览，首次操作时自动接入任务体系。
              </p>
            </div>
            <div className="session-overview__summary">
              <div>
                <strong>{activeTaskCount}</strong>
                <span>个活跃任务</span>
              </div>
              <div>
                <strong>{state.tasks.length}</strong>
                <span>个任务</span>
              </div>
              {state.attentionCount > 0 ? (
                <div className="session-overview__summary--attention">
                  <strong>{state.attentionCount}</strong>
                  <span>需要处理</span>
                </div>
              ) : null}
            </div>
            {state.tasks.length === 0 && state.sessions.length === 0 ? (
              <section className="empty-state" aria-live="polite">
                <MapleStatusMark />
                <h2>工作台暂时安静。</h2>
                <p>还没有任务。可以从一句清晰的话开始。</p>
                <button className="button button--primary" type="button" onClick={() => setNewTaskOpen(true)}>
                  新建任务
                </button>
              </section>
            ) : (
              <div className="session-overview__hint">
                <MapleStatusMark />
                <p>从左侧打开一个任务或会话，继续推进。</p>
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
        connectionState={state.connectionState}
      />
    </div>
  );
}

/** 检测事件负载是否看起来像 TaskState。 */
function isTaskStateLike(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.sessionId === "string" && typeof candidate.status === "string";
}
