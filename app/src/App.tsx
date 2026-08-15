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
import { Toast } from "@/components/Toast";

function App() {
  const gateway = useGateway();
  const tasks = useTasks(gateway.client);
  const task = useTask(gateway.client);
  const models = useModels(gateway.client);
  const remote = useRemoteDesktop();
  const { theme, setTheme } = useTheme();

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
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
    if (!gateway.configured) setSettingsOpen(true);
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
      void task.openTask(next);
    },
    [task],
  );

  const newTask = useCallback(async () => {
    const created = await tasks.createTask();
    if (created) {
      setActiveTaskId(created.id);
      await task.openTask(created);
      showToast("已新建任务");
    }
  }, [task, tasks, showToast]);

  return (
    <>
      <AppShell
        activeView="tasks"
        onActiveViewChange={() => {}}
        onOpenSettings={() => setSettingsOpen(true)}
        sidebar={
          <Sidebar
            tasks={tasks}
            activeTaskId={activeTaskId}
            onPickTask={(t) => void pickTask(t)}
            onNewTask={() => void newTask()}
          />
        }
      >
        <ChatPanel task={task} models={models} />
      </AppShell>

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
