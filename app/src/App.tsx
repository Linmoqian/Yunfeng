// Aura — 正式 UI 壳：数据层 hooks 统一管理，组合各 Aura 组件。
// 替换原三变体原型（/a /b /c）。
import { useCallback, useEffect, useRef, useState } from "react";
import { useSidecar } from "./hooks/useSidecar";
import { useSessions } from "./hooks/useSessions";
import { useSession } from "./hooks/useSession";
import { useFileTree } from "./hooks/useFileTree";
import { useModels } from "./hooks/useModels";
import { openSessionAndSyncTree } from "./lib/sessionActions";
import type { SessionInfo } from "./lib/types";
import type { FileTreeNode } from "./hooks/useFileTree";
import { TitleBar } from "./components/aura/TitleBar";
import { Sidebar } from "./components/aura/Sidebar";
import { ChatArea } from "./components/aura/ChatArea";
import { FilePreview } from "./components/aura/FilePreview";
import { Spotlight } from "./components/aura/Spotlight";
import { Toast } from "./components/aura/Toast";
import "./index.css";
import "./App.css";

function App() {
  const sidecar = useSidecar();
  const sessions = useSessions(sidecar.client);
  const session = useSession(sidecar.client);
  const fileTree = useFileTree(sidecar.client);
  const models = useModels(sidecar.client);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  // 启动 sidecar
  useEffect(() => {
    if (sidecar.status === "idle") {
      sidecar.start().catch((e: unknown) => {
        setBannerError(e instanceof Error ? e.message : String(e));
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  // 切换会话（会话/文件树同步）
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

  // 新建会话：无项目根目录时先选择
  const newSession = useCallback(() => {
    const root = sessions.projectRoot;
    if (!root) {
      void sessions.pickDirectory().then((d) => {
        if (d) {
          localStorage.setItem("pi-project-root", d);
          fileTree.setRoot(d);
        }
      });
      return;
    }
    void session.newSession(root);
  }, [sessions, session, fileTree]);

  // 打开文件：加载内容 + 预览浮层
  const openFile = useCallback(
    (n: FileTreeNode) => {
      void fileTree.selectFile(n);
      setFilePreviewOpen(true);
      showToast(`已引用文件上下文: ${n.name}`);
    },
    [fileTree, showToast],
  );

  return (
    <div className="bg-slate-100/80 text-slate-800 font-sans antialiased h-screen w-screen overflow-hidden select-none transition-colors duration-300">
      {/* 背景渐变光斑 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[45vw] h-[45vw] rounded-full bg-gradient-to-tr from-indigo-200/40 via-purple-200/30 to-pink-100/40 blur-[100px]" />
        <div className="absolute -bottom-[10%] -right-[5%] w-[55vw] h-[55vw] rounded-full bg-gradient-to-br from-blue-200/40 via-cyan-100/30 to-teal-100/40 blur-[120px]" />
      </div>

      {/* 主画布容器 */}
      <div className="relative z-10 w-full h-full p-3 md:p-6 flex flex-col justify-between">
        <div className="w-full h-full max-w-[1400px] mx-auto bg-white/80 apple-glass border border-white/80 rounded-3xl shadow-apple-float flex flex-col overflow-hidden transition-all duration-300">
          <TitleBar modelCount={models.models?.available.length ?? 0} onOpenSpotlight={() => setSpotlightOpen(true)} />

          <div className="flex-1 flex overflow-hidden">
            <Sidebar
              sessions={sessions}
              session={session}
              fileTree={fileTree}
              onPickSession={(s) => void pickSession(s)}
              onNewSession={newSession}
              onOpenFile={openFile}
              onToast={showToast}
            />
            <ChatArea
              session={session}
              models={models}
              bannerError={bannerError}
              onDismissBanner={() => setBannerError(null)}
              onPickDirectory={() =>
                sessions.pickDirectory().then((d) => {
                  if (d) {
                    localStorage.setItem("pi-project-root", d);
                    fileTree.setRoot(d);
                  }
                })
              }
            />
          </div>
        </div>
      </div>

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

      <Toast message={toast} />
    </div>
  );
}

export default App;
