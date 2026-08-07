import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  type TaskState,
  type TaskStreamEvent,
} from "../../services/taskService";
const TaskFocusPanel = lazy(() => import("../../features/workbench/TaskFocusPanel").then((module) => ({ default: module.TaskFocusPanel })));
const NewTaskDialog = lazy(() => import("../../features/workbench/NewTaskDialog").then((module) => ({ default: module.NewTaskDialog })));
const SettingsDialog = lazy(() => import("../../features/workbench/SettingsDialog").then((module) => ({ default: module.SettingsDialog })));
import {
  buildTaskSections,
  collectProjects,
  selectMostRecentActiveTask,
  sessionToLegacySummary,
  taskToSummary,
  type TaskSummary,
} from "../../features/workbench/taskPresentation";
import { useThemeMode } from "../../theme/ThemeProvider";
import {
  getInitialSelection,
  workbenchActions,
} from "../../store/workbenchSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { SessionSidebar } from "./components/SessionSidebar";
import { WorkbenchHeader } from "./components/WorkbenchHeader";
import { OverviewPane } from "./components/OverviewPane";
import "./workbench.css";

function isTaskStateLike(value: unknown): value is TaskState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.sessionId === "string" && typeof candidate.status === "string";
}

export function WorkbenchPage() {
  const dispatch = useAppDispatch();
  const { setMode, mode: themeMode } = useThemeMode();
  const initialTaskResolved = useRef(false);

  const tasks = useAppSelector((state) => state.workbench.tasks);
  const sessions = useAppSelector((state) => state.workbench.sessions);
  const currentTaskId = useAppSelector((state) => state.workbench.currentTaskId);
  const currentSessionId = useAppSelector((state) => state.workbench.currentSessionId);
  const connectionState = useAppSelector((state) => state.workbench.connectionState);
  const loadError = useAppSelector((state) => state.workbench.loadError);
  const search = useAppSelector((state) => state.workbench.search);
  const projectFilter = useAppSelector((state) => state.workbench.projectFilter);
  const archivedFilter = useAppSelector((state) => state.workbench.archivedFilter);
  const attentionCount = useAppSelector((state) => state.workbench.attentionCount);

  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem("yunfeng-sidebar-collapsed") === "true";
  });
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({ models: [], defaultModel: null, thinkingLevels: {}, thinkingLevelPins: {} });
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

  // 初始深链接选择（URL ?task / ?session）
  useEffect(() => {
    const { taskId, sessionId } = getInitialSelection();
    if (taskId) dispatch(workbenchActions.selectTask(taskId));
    else if (sessionId) dispatch(workbenchActions.selectSession(sessionId));
  }, [dispatch]);

  const currentTask = currentTaskId ? tasks.find((task) => task.id === currentTaskId) ?? null : null;
  const currentSession = currentSessionId ? sessions.find((session) => session.id === currentSessionId) ?? null : null;

  const allSummaries = useMemo(() => {
    const taskSummaries = tasks.map(taskToSummary);
    const legacySummaries = sessions
      .filter((session) => !tasks.some((task) => task.sessionId === session.id))
      .map(sessionToLegacySummary);
    return [...taskSummaries, ...legacySummaries];
  }, [sessions, tasks]);

  const filteredSummaries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allSummaries.filter((task) => {
      if (projectFilter && task.projectName !== projectFilter) return false;
      if (archivedFilter === "archived" && task.section !== "archived") return false;
      if (archivedFilter === "active" && task.section === "archived") return false;
      if (needle) {
        return (
          task.title.toLowerCase().includes(needle) ||
          task.currentAction.toLowerCase().includes(needle) ||
          task.cwd.toLowerCase().includes(needle)
        );
      }
      return true;
    });
  }, [allSummaries, archivedFilter, projectFilter, search]);

  const sections = useMemo(
    () => buildTaskSections(filteredSummaries, archivedFilter === "all" || archivedFilter === "archived"),
    [filteredSummaries, archivedFilter],
  );
  const projects = useMemo(() => collectProjects(allSummaries), [allSummaries]);
  const activeTaskCount = tasks.filter((task) => task.status !== "completed" && task.status !== "archived").length;

  const modelCwd = currentTask?.cwd || currentSession?.cwd || tasks.find((task) => task.cwd)?.cwd;

  const refreshSnapshot = useCallback(async () => {
    try {
      const [taskResult, legacySessions] = await Promise.all([
        loadTasks({ limit: 500 }),
        loadLegacySessions(),
      ]);
      dispatch(workbenchActions.snapshot({ tasks: taskResult.tasks, sessions: legacySessions }));
      if (!initialTaskResolved.current) {
        const initialSelection = getInitialSelection();
        initialTaskResolved.current = true;
        if (!initialSelection.taskId && !initialSelection.sessionId) {
          const recentTask = selectMostRecentActiveTask(taskResult.tasks);
          if (recentTask) dispatch(workbenchActions.selectTask(recentTask.id));
        }
      }
      dispatch(workbenchActions.connection({ state: "connected", error: null }));
    } catch (error) {
      dispatch(workbenchActions.connection({
        state: "offline",
        error: error instanceof Error ? error.message : "任务状态暂时无法读取",
      }));
    }
  }, [dispatch]);

  useEffect(() => {
    void refreshSnapshot();
    return subscribeTaskSummary(
      (event: TaskStreamEvent) => {
        if (event.type === "task_snapshot" && Array.isArray(event.tasks)) {
          dispatch(workbenchActions.snapshot({ tasks: event.tasks as TaskState[], sessions }));
          return;
        }
        if (event.type === "task_updated" && event.taskId && isTaskStateLike(event.data)) {
          dispatch(workbenchActions.taskUpdated(event.data));
        }
      },
      (connected) => dispatch(workbenchActions.connection({ state: connected ? "connected" : "offline" })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSnapshot]);

  // 同步 URL 深链接
  useEffect(() => {
    const params = new URLSearchParams();
    if (currentTaskId) params.set("task", currentTaskId);
    if (currentSessionId) params.set("session", currentSessionId);
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [currentTaskId, currentSessionId]);

  // popstate：浏览器前进后退恢复选择
  useEffect(() => {
    const onPopState = () => {
      const { taskId, sessionId } = getInitialSelection();
      if (taskId) dispatch(workbenchActions.selectTask(taskId));
      else if (sessionId) dispatch(workbenchActions.selectSession(sessionId));
      else {
        dispatch(workbenchActions.selectTask(null));
        dispatch(workbenchActions.selectSession(null));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dispatch]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelCwd, modelReloadKey, currentTask?.id, settingsOpen]);

  async function handleCreateTask(cwd: string, message: string) {
    const { task } = await createTask(cwd, message, modelSelection);
    dispatch(workbenchActions.taskUpdated(task));
    dispatch(workbenchActions.selectTask(task.id));
    await refreshSnapshot();
  }

  async function handleRename(taskId: string, name: string) {
    const updated = await renameTask(taskId, name);
    dispatch(workbenchActions.taskUpdated(updated));
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
      dispatch(workbenchActions.selectSession(task.sessionId));
    } else {
      dispatch(workbenchActions.selectTask(task.id));
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

  const layoutClass = sidebarCollapsed ? "app-shell app-shell--sidebar-collapsed" : "app-shell";

  return (
    <Suspense fallback={null}>
      <div className={layoutClass}>
        <SessionSidebar
          sections={sections}
          taskCount={tasks.length}
          attentionCount={attentionCount}
          activeTaskId={currentTask?.id ?? currentSession?.id}
          collapsed={sidebarCollapsed}
          search={search}
          onSearch={(value) => dispatch(workbenchActions.search(value))}
          projectFilter={projectFilter}
          projects={projects}
          onProjectFilter={(value) => dispatch(workbenchActions.project(value))}
          archivedFilter={archivedFilter}
          onArchivedFilter={(value) => dispatch(workbenchActions.archived(value))}
          onOpenTask={handleOpenTask}
          onNewTask={() => setNewTaskOpen(true)}
          onRename={handleRename}
          onArchive={handleArchive}
          onReopen={handleReopen}
        />

        <main className="session-main">
          <WorkbenchHeader
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
            hasFocus={Boolean(currentTask || currentSession)}
            connectionState={connectionState}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {connectionState === "offline" && loadError ? (
            <div className="connection-notice" role="status">
              <span>{loadError}</span>
              <button className="text-button" type="button" onClick={() => void refreshSnapshot()}>重新连接</button>
            </div>
          ) : null}

          {currentTask ? (
            <TaskFocusPanel
              task={currentTask}
              onClose={() => dispatch(workbenchActions.selectTask(null))}
              onTaskUpdated={(task) => dispatch(workbenchActions.taskUpdated(task))}
              modelCatalog={modelCatalog}
            />
          ) : currentSession ? (
            <TaskFocusPanel
              legacySession={currentSession}
              onClose={() => dispatch(workbenchActions.selectSession(null))}
              onTaskUpdated={(task) => {
                dispatch(workbenchActions.taskUpdated(task));
                dispatch(workbenchActions.selectTask(task.id));
              }}
              modelCatalog={modelCatalog}
            />
          ) : (
            <OverviewPane
              activeTaskCount={activeTaskCount}
              taskCount={tasks.length}
              attentionCount={attentionCount}
              hasAny={tasks.length > 0 || sessions.length > 0}
              onNewTask={() => setNewTaskOpen(true)}
            />
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
          onThemeChange={setMode}
          modelSelection={modelSelection}
          modelOptions={modelCatalog.models}
          modelLoading={modelLoading}
          modelError={modelError}
          onModelChange={handleModelChange}
          onRetryModels={() => setModelReloadKey((value) => value + 1)}
          connectionState={connectionState}
        />
      </div>
    </Suspense>
  );
}
