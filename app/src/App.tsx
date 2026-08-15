import { useCallback, useEffect, useRef, useState } from "react";
import { useGateway } from "@/hooks/useGateway";
import { useTasks } from "@/hooks/useTasks";
import { useTask } from "@/hooks/useTask";
import { useModels } from "@/hooks/useModels";
import { useRemoteDesktop } from "@/hooks/useRemoteDesktop";
import { useTheme } from "@/hooks/useTheme";
import type { TaskState } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionTask, setActionTask] = useState<TaskState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

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

  const pickTask = useCallback(
    (next: TaskState) => {
      setActiveTaskId(next.id);
      setSidebarOpen(false);
      void task.openTask(next);
    },
    [task],
  );

  const newTask = useCallback(async () => {
    const created = await tasks.createTask();
    if (created !== null) {
      setActiveTaskId(created.id);
      setSidebarOpen(false);
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
      <AppShell
        activeView="tasks"
        onActiveViewChange={() => {}}
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
          />
        }
      >
        <ChatPanel
          task={task}
          models={models}
          onOpenTasks={() => setSidebarOpen(true)}
          onOpenTaskActions={() => {
            if (task.task !== null) setActionTask(task.task);
          }}
        />
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
