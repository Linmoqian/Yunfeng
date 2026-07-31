// 变体 B：工程工作台。IDE 式 dock 布局：
// 左侧工具 dock（会话/项目 tab 切换）+ 中部对话 + 右侧文件树 dock + 底部活动条。
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Composer } from "../Composer";
import { MessageList } from "../MessageList";
import { Banner } from "../Banner";
import { TreeView } from "../TreeView";
import { ModelList } from "../ModelList";
import { Icons } from "../Icons";
import { openSessionAndSyncTree } from "../../lib/sessionActions";
import type { SessionInfo } from "../../lib/types";
import type { VariantProps } from "./variantTypes";

type LeftTab = "sessions" | "project";

export function VariantB({
  sessions,
  session,
  fileTree,
  models,
  bannerError,
  dismissBannerError,
}: VariantProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>("sessions");
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  useEffect(() => {
    if (fileTree.selectedFile) setFilePreviewOpen(true);
  }, [fileTree.selectedFile]);

  const pickSession = async (s: SessionInfo) => {
    try {
      await openSessionAndSyncTree(s, sessions, session, fileTree);
    } catch {
      // 错误由 session.error 呈现
    }
  };

  const currentModel = models.findModel(session.state?.model?.provider, session.state?.model?.id);

  return (
    <div className="vb-shell">
      <header className="vb-topbar">
        <span className="vb-brand">Pi Workbench</span>
        <div className="vb-topbar-tabs">
          <button
            className={`vb-topbar-tab ${leftTab === "sessions" ? "vb-topbar-tab-active" : ""}`}
            onClick={() => setLeftTab("sessions")}
          >
            会话
          </button>
          <button
            className={`vb-topbar-tab ${leftTab === "project" ? "vb-topbar-tab-active" : ""}`}
            onClick={() => setLeftTab("project")}
          >
            项目
          </button>
        </div>
        <div className="vb-model-wrap">
          <button className="vb-model" onClick={() => setModelMenuOpen((o) => !o)}>
            {currentModel ? currentModel.name : "选择模型"}
          </button>
          <AnimatePresence>
            {modelMenuOpen && (
              <>
                <div className="vb-backdrop" onClick={() => setModelMenuOpen(false)} />
                <motion.div
                  className="vb-model-menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.13, ease: "easeOut" }}
                >
                <ModelList
                  prefix="vb"
                  grouped={models.grouped}
                  activeModel={session.state?.model}
                  disabled={!session.rpcSessionId}
                  onSelect={(provider, modelId) => {
                    setModelMenuOpen(false);
                    return session.setModel(provider, modelId);
                  }}
                />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {bannerError && <Banner prefix="vb" message={bannerError} onDismiss={dismissBannerError} />}

      <div className="vb-body">
        {/* 左 dock */}
        <aside className="vb-dock-left">
          {leftTab === "sessions" && (
            <>
              <div className="vb-dock-toolbar">
                <span className="vb-dock-label">全部会话</span>
                <button
                  className="vb-dock-new"
                  disabled={!sessions.projectRoot}
                  onClick={() => void session.newSession(sessions.projectRoot ?? "")}
                  title="新建会话"
                >
                  <Icons.Plus size={14} />
                </button>
              </div>
              <div className="vb-dock-list">
                {sessions.sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`vb-session ${session.session?.id === s.id ? "vb-session-active" : ""}`}
                    onClick={() => void pickSession(s)}
                  >
                    <div className="vb-session-name">{s.name || s.firstMessage || "(无消息)"}</div>
                    <div className="vb-session-meta">
                      {s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? "?"} · {s.messageCount}
                    </div>
                  </div>
                ))}
                {sessions.sessions.length === 0 && <div className="vb-dock-empty">暂无会话</div>}
              </div>
            </>
          )}

          {leftTab === "project" && (
            <>
              <div className="vb-dock-toolbar">
                <span className="vb-dock-label">项目</span>
                {sessions.projectRoot && (
                  <button className="vb-dock-new" onClick={() => void sessions.pickDirectory()} title="切换目录">
                    <Icons.RefreshCw size={12} />
                  </button>
                )}
              </div>
              <div className="vb-dock-list">
                {!sessions.projectRoot && (
                  <button
                    className="vb-project-pick"
                    onClick={() => void sessions.pickDirectory().then((d) => d && fileTree.setRoot(d))}
                  >
                    选择项目目录
                  </button>
                )}
                {sessions.projectRoot && (
                  <div className="vb-project-root">{sessions.projectRoot}</div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* 中部对话 */}
        <main className="vb-chat">
          <div className="vb-chat-header">
            <span className="vb-chat-title">{session.session?.name || "对话"}</span>
            {(session.isStreaming || session.runningTools.length > 0) && (
              <span className="vb-chat-status">
                {session.runningTools.map((t) => t.name).join(", ") || "思考中…"}
              </span>
            )}
          </div>
          <MessageList
            prefix="vb"
            className="vb-chat-scroll"
            messages={session.messages}
            streamingMessage={session.streamingMessage}
            showRoleLabels
            empty={<div className="vb-empty">选择一个会话，或从左侧 dock 新建会话开始</div>}
          />
          <Composer
            prefix="vb"
            disabled={!session.rpcSessionId}
            isStreaming={session.isStreaming}
            placeholder={session.rpcSessionId ? "输入消息…" : "先选择会话"}
            onSend={session.sendPrompt}
            onAbort={session.abort}
          />
        </main>

        {/* 右 dock：文件树 + 预览 */}
        <aside className="vb-dock-right">
          <div className="vb-dock-toolbar">
            <span className="vb-dock-label">文件</span>
            {fileTree.selectedFile && (
              <button
                className="vb-dock-new"
                onClick={() => setFilePreviewOpen((o) => !o)}
                title="切换预览"
              >
                {filePreviewOpen ? "▔" : "▁"}
              </button>
            )}
          </div>
          {!fileTree.root ? (
            <div className="vb-dock-empty">未选择项目</div>
          ) : (
            <div className="vb-tree">
              <TreeView
                prefix="vb"
                nodes={fileTree.tree}
                selectedPath={fileTree.selectedFile?.path ?? null}
                onToggle={fileTree.toggleDir}
                onSelect={fileTree.selectFile}
              />
            </div>
          )}
          {filePreviewOpen && fileTree.selectedFile && (
            <div className="vb-preview">
              <div className="vb-preview-header">{fileTree.selectedFile.name}</div>
              <pre className="vb-preview-content">{fileTree.fileContent?.content ?? ""}</pre>
            </div>
          )}
        </aside>
      </div>

      {/* 底部活动条 */}
      <footer className="vb-statusbar">
        <span className="vb-status-item">
          {session.rpcSessionId
            ? currentModel
              ? `模型：${currentModel.name}`
              : "模型：未设置"
            : "空闲"}
        </span>
        <span className="vb-status-item">{session.messages.length} 条消息</span>
        <span className="vb-status-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {fileTree.root ? (
            <>
              <Icons.Folder size={11} /> {fileTree.root.split(/[\\/]/).pop()}
            </>
          ) : (
            "无项目"
          )}
        </span>
      </footer>
    </div>
  );
}
