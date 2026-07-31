import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatWindow } from "./components/ChatWindow";
import { FileExplorer } from "./components/FileExplorer";
import { ModelPicker } from "./components/ModelPicker";
import { useSidecar } from "./hooks/useSidecar";
import { useSessions } from "./hooks/useSessions";
import { useSession } from "./hooks/useSession";
import { useFileTree } from "./hooks/useFileTree";
import { useModels } from "./hooks/useModels";
import type { SessionInfo } from "./lib/types";
import "./App.css";

function App() {
  const sidecar = useSidecar();
  const sessions = useSessions(sidecar.client);
  const session = useSession(sidecar.client);
  const fileTree = useFileTree(sidecar.client);
  const models = useModels(sidecar.client);
  const [showFiles, setShowFiles] = useState(true);
  const [sidecarError, setSidecarError] = useState<string | null>(null);

  // 启动 sidecar
  useEffect(() => {
    if (sidecar.status === "idle") {
      sidecar.start().catch((e: unknown) => {
        setSidecarError(e instanceof Error ? e.message : String(e));
      });
    }
  }, [sidecar]);

  // sidecar 就绪后恢复 projectRoot（从本地存储）
  useEffect(() => {
    if (sidecar.status === "ready") {
      const saved = localStorage.getItem("pi-project-root");
      if (saved) {
        sessions.restoreProject(saved);
        fileTree.setRoot(saved);
      }
    }
  }, [sidecar.status]);

  const handleSelectSession = useCallback(
    async (s: SessionInfo) => {
      const cwd = s.cwd ?? sessions.projectRoot ?? "";
      if (!cwd) {
        setSidecarError("该会话没有工作目录，请先选择项目目录");
        return;
      }
      try {
        await session.openSession(s, cwd);
        if (sessions.projectRoot !== cwd) {
          fileTree.setRoot(cwd);
        }
      } catch (e) {
        setSidecarError(e instanceof Error ? e.message : String(e));
      }
    },
    [session, sessions.projectRoot, fileTree],
  );

  const handleNewSession = useCallback(async () => {
    if (!sessions.projectRoot) return;
    try {
      await session.newSession(sessions.projectRoot);
      fileTree.setRoot(sessions.projectRoot);
    } catch (e) {
      setSidecarError(e instanceof Error ? e.message : String(e));
    }
  }, [session, sessions.projectRoot, fileTree]);

  const handlePickDirectory = useCallback(async () => {
    const dir = await sessions.pickDirectory();
    if (dir) {
      localStorage.setItem("pi-project-root", dir);
      fileTree.setRoot(dir);
    }
  }, [sessions, fileTree]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">Pi Desktop</div>
        <ModelPicker
          models={models}
          currentModel={session.state?.model}
          disabled={!session.rpcSessionId}
          onSelect={session.setModel}
        />
        <button
          className={`btn btn-small ${showFiles ? "btn-active" : ""}`}
          onClick={() => setShowFiles((s) => !s)}
        >
          文件工作区
        </button>
      </header>

      <div className="app-body">
        <Sidebar
          sessions={sessions.sessions}
          loading={sessions.loading}
          activeSessionId={session.session?.id ?? null}
          projectRoot={sessions.projectRoot}
          onSelect={(s) => void handleSelectSession(s)}
          onNewSession={() => void handleNewSession()}
          onPickDirectory={handlePickDirectory}
          onClearProject={() => {
            sessions.clearProject();
            localStorage.removeItem("pi-project-root");
            session.closeSession();
          }}
        />

        <main className="chat-area">
          {(sidecar.status === "starting" || sidecar.status === "idle") && (
            <div className="app-banner">正在启动 agent 引擎…</div>
          )}
          {sidecar.status === "error" && (
            <div className="app-banner app-banner-error">agent 引擎启动失败：{sidecar.error}</div>
          )}
          {sidecarError && (
            <div className="app-banner app-banner-error">
              {sidecarError}
              <button className="btn btn-small" onClick={() => setSidecarError(null)}>
                关闭
              </button>
            </div>
          )}
          <ChatWindow
            messages={session.messages}
            streamingMessage={session.streamingMessage}
            runningTools={session.runningTools}
            isStreaming={session.isStreaming}
            isCompacting={session.isCompacting}
            sessionName={session.session?.name ?? ""}
            disabled={!session.rpcSessionId || sidecar.status !== "ready"}
            onSend={session.sendPrompt}
            onAbort={session.abort}
          />
        </main>

        {showFiles && (
          <aside className="file-area">
            <FileExplorer
              root={fileTree.root}
              tree={fileTree.tree}
              loading={fileTree.loading}
              selectedFile={fileTree.selectedFile}
              fileContent={fileTree.fileContent}
              fileLoading={fileTree.fileLoading}
              onToggleDir={fileTree.toggleDir}
              onSelectFile={fileTree.selectFile}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;
