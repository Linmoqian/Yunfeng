import { useCallback, useEffect, useRef, useState } from "react";
import { useSidecar } from "@/hooks/useSidecar";
import { useSessions } from "@/hooks/useSessions";
import { useSession } from "@/hooks/useSession";
import { useFileTree } from "@/hooks/useFileTree";
import { useModels } from "@/hooks/useModels";
import { useTheme } from "@/hooks/useTheme";
import { openSessionAndSyncTree } from "@/lib/sessionActions";
import type { SessionInfo } from "@/lib/types";
import type { FileTreeNode } from "@/hooks/useFileTree";
import { AppShell } from "@/components/AppShell";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { Spotlight } from "@/components/Spotlight";
import { FilePreview } from "@/components/FilePreview";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Toast } from "@/components/Toast";

function App() {
  const sidecar = useSidecar();
  const sessions = useSessions(sidecar.client);
  const session = useSession(sidecar.client);
  const fileTree = useFileTree(sidecar.client);
  const models = useModels(sidecar.client);
  const { theme, setTheme } = useTheme();

  const [toast, setToast] = useState<string | null>(null);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  // 启动 sidecar
  useEffect(() => {
    if (sidecar.status === "idle") {
      sidecar.start().catch((e: unknown) => {
        showToast(e instanceof Error ? e.message : String(e));
      });
    }
  }, [sidecar, showToast]);

  // sidecar 就绪后恢复 projectRoot
  useEffect(() => {
    if (sidecar.status === "ready") {
      const saved = localStorage.getItem("pi-project-root");
      if (saved) {
        sessions.restoreProject(saved);
        fileTree.setRoot(saved);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidecar.status]);

  // ⌘K 打开/关闭命令面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlightOpen((o) => !o);
      }
      if (e.key === "Escape") setSpotlightOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pickDirectory = useCallback(() => {
    void sessions.pickDirectory().then((d) => {
      if (d) {
        localStorage.setItem("pi-project-root", d);
        fileTree.setRoot(d);
      }
    });
  }, [sessions, fileTree]);

  const pickSession = useCallback(
    async (s: SessionInfo) => {
      try {
        await openSessionAndSyncTree(s, sessions, session, fileTree);
      } catch {
        // 错误由 session.error 呈现
      }
    },
    [sessions, session, fileTree],
  );

  const newSession = useCallback(() => {
    const root = sessions.projectRoot;
    if (!root) {
      pickDirectory();
      return;
    }
    void session.newSession(root);
  }, [sessions, session, pickDirectory]);

  const openFile = useCallback(
    (n: FileTreeNode) => {
      void fileTree.selectFile(n);
      setFilePreviewOpen(true);
      showToast(`已引用文件上下文: ${n.name}`);
    },
    [fileTree, showToast],
  );

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            sessions={sessions}
            session={session}
            fileTree={fileTree}
            onPickSession={(s) => void pickSession(s)}
            onNewSession={newSession}
            onOpenFile={openFile}
            onPickDirectory={pickDirectory}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
      >
        <ChatPanel session={session} models={models} onPickDirectory={pickDirectory} />
      </AppShell>

      {filePreviewOpen && fileTree.selectedFile && (
        <FilePreview
          file={fileTree.selectedFile}
          content={fileTree.fileContent?.content ?? ""}
          loading={fileTree.fileLoading}
          onClose={() => setFilePreviewOpen(false)}
        />
      )}

      <Spotlight
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        sessions={sessions.sessions}
        onPickSession={pickSession}
        models={models.grouped}
        activeModel={session.state?.model}
        onSelectModel={(p, m) => session.setModel(p, m)}
        onNewSession={newSession}
      />

      <SettingsSheet
        open={settingsOpen}
        theme={theme}
        onThemeChange={setTheme}
        projectRoot={sessions.projectRoot}
        onPickDirectory={pickDirectory}
        onClose={() => setSettingsOpen(false)}
      />

      <Toast message={toast} />
    </>
  );
}

export default App;
