import { useCallback, useEffect, useRef, useState } from "react";
import { useGateway } from "@/hooks/useGateway";
import { useTasks } from "@/hooks/useTasks";
import { useTask } from "@/hooks/useTask";
import { useModels } from "@/hooks/useModels";
import { useRemoteDesktop } from "@/hooks/useRemoteDesktop";
import { useTheme } from "@/hooks/useTheme";
import { useApprovalNotifications, useTaskNotifications } from "@/hooks/useNotifications";
import { loadNotificationsEnabled, saveNotificationsEnabled } from "@/lib/notifications";
import type { TaskState } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { TaskBoard } from "@/components/TaskBoard";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { SettingsSheet } from "@/components/SettingsSheet";
import { RemoteDesktopPanel } from "@/components/RemoteDesktopPanel";
import { TaskActionSheet } from "@/components/TaskActionSheet";
import { Toast } from "@/components/Toast";

function App() {
  const gateway = useGateway();
  const tasks = useTasks(gateway.client);
  const task = useTask(gateway.client);
  const models = useModels(gateway.client);
  const remote = useRemoteDesktop();
  const { theme, setTheme } = useTheme();

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [mainView, setMainView] = useState<"chat" | "board">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionTask, setActionTask] = useState<TaskState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => loadNotificationsEnabled());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const toggleNotifications = useCallback((enabled: boolean) => {
    saveNotificationsEnabled(enabled);
    setNotificationsEnabled(enabled);
  }, []);

  // 页面隐藏时提醒任务状态变化与新审批。
  useTaskNotifications(tasks.tasks, notificationsEnabled);
  useApprovalNotifications(
    task.approvals.length,
    task.approvals[task.approvals.length - 1]?.title ?? null,
    notificationsEnabled,
  );

  // 首次使用时引导配置网关；不启动任何设备内后端。
  useEffect(() => {
    if (gateway.configured === false) setSettingsOpen(true);
  }, [gateway.configured]);

  useEffect(() => {
    if (task.error) showToast(task.error);
  }, [task.error, showToast]);
  useEffect(() => {
    if (tasks.error) showToast(tasks.error);
  }, [tasks.error, showToast]);

  // 断线恢复：提示 + 刷新列表 + 重建当前任务事件流。
  const wasOnlineRef = useRef<boolean | null>(gateway.online);
  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = gateway.online;
    if (wasOnline === false && gateway.online === true) {
      showToast("连接已恢复");
      void tasks.refresh();
      void task.reconnect();
    }
  }, [gateway.online, showToast, task.reconnect, tasks.refresh]);

  const pickTask = useCallback(
    (next: TaskState) => {
      setActiveTaskId(next.id);
      setSidebarOpen(false);
      setMainView("chat");
      void task.openTask(next);
    },
    [task],
  );

  const openBoard = useCallback(() => {
    setMainView("board");
    setSidebarOpen(false);
  }, []);

  const newTask = useCallback(async () => {
    const created = await tasks.createTask();
    if (created !== null) {
      setActiveTaskId(created.id);
      setSidebarOpen(false);
      setMainView("chat");
      await task.openTask(created);
      showToast("已新建任务");
    }
  }, [task, tasks, showToast]);

  const renameActionTask = useCallback(
    async (name: string) => {
      if (actionTask === null) return;
      const updated = await tasks.renameTask(actionTask.id, name);
      if (updated !== null && activeTaskId === updated.id) {
        await task.openTask(updated);
      }
    },
    [actionTask, activeTaskId, task, tasks],
  );

  const archiveActionTask = useCallback(async () => {
    if (actionTask === null) return;
    await tasks.archiveTask(actionTask.id);
    showToast("任务已归档");
  }, [actionTask, showToast, tasks]);

  const reopenActionTask = useCallback(async () => {
    if (actionTask === null) return;
    await tasks.reopenTask(actionTask.id);
    showToast("任务已重新打开");
  }, [actionTask, showToast, tasks]);

  const retryActionTask = useCallback(async () => {
    if (actionTask === null) return;
    await task.openTask(actionTask);
    await task.retry();
  }, [actionTask, task]);

  return (
    <>
      <ConnectionBanner online={gateway.online} onRetry={() => void gateway.checkOnline()} />
      <AppShell
        activeView="tasks"
        onActiveViewChange={() => setMainView("chat")}
        onOpenSettings={() => setSettingsOpen(true)}
        sidebarOpen={sidebarOpen}
        onSidebarClose={() => setSidebarOpen(false)}
        sidebar={
          <Sidebar
            tasks={tasks}
            activeTaskId={activeTaskId}
            onPickTask={(t) => void pickTask(t)}
            onMoreTask={(t) => setActionTask(t)}
            onNewTask={() => void newTask()}
            onOpenBoard={openBoard}
          />
        }
      >
        {mainView === "board" ? (
          <TaskBoard
            tasks={tasks.tasks}
            loading={tasks.loading}
            onBack={() => setMainView("chat")}
            onNewTask={() => void newTask()}
            onPick={(t) => void pickTask(t)}
            onMore={(t) => setActionTask(t)}
          />
        ) : (
          <ChatPanel
            task={task}
            models={models}
            online={gateway.online}
            onOpenTasks={() => setSidebarOpen(true)}
            onOpenTaskActions={() => {
              if (task.task !== null) setActionTask(task.task);
            }}
          />
        )}
      </AppShell>

      {actionTask !== null && (
        <TaskActionSheet
          task={actionTask}
          open
          onClose={() => setActionTask(null)}
          onRename={renameActionTask}
          onArchive={archiveActionTask}
          onReopen={reopenActionTask}
          onRetry={retryActionTask}
        />
      )}

      <SettingsSheet
        open={settingsOpen}
        theme={theme}
        onThemeChange={setTheme}
        gateway={gateway}
        remote={remote}
        notificationsEnabled={notificationsEnabled}
        onNotificationsChange={toggleNotifications}
        onOpenRemote={() => {
          setSettingsOpen(false);
          setRemoteOpen(true);
        }}
        onClose={() => setSettingsOpen(false)}
      />

      {remoteOpen && (
        <RemoteDesktopPanel remote={remote} onClose={() => setRemoteOpen(false)} />
      )}

      <Toast message={toast} />
    </>
  );
}

export default App;
