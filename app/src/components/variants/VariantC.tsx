// 变体 C：沉浸式对话。全屏消息流，会话走左侧滑出抽屉，
// 文件与模型走浮层。强调专注与对话连续性。
import { useState } from "react";
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

export function VariantC({
  sessions,
  session,
  fileTree,
  models,
  bannerError,
  dismissBannerError,
}: VariantProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filePanel, setFilePanel] = useState(false);
  const [modelPanel, setModelPanel] = useState(false);

  const pickSession = async (s: SessionInfo) => {
    setDrawerOpen(false);
    try {
      await openSessionAndSyncTree(s, sessions, session, fileTree);
    } catch {
      // 错误由 session.error 呈现
    }
  };

  const currentModel = models.findModel(session.state?.model?.provider, session.state?.model?.id);

  return (
    <div className="vc-shell">
      <header className="vc-topbar">
        <button className="vc-iconbtn" onClick={() => setDrawerOpen(true)} title="会话列表">
          <Icons.Menu size={17} />
        </button>
        <div className="vc-title">
          <div className="vc-title-main">{session.session?.name || "Pi"}</div>
          <div className="vc-title-sub">
            {session.rpcSessionId
              ? currentModel
                ? currentModel.name
                : "未设置模型"
              : "选择一个会话开始"}
          </div>
        </div>
        <div className="vc-actions">
          <button className="vc-iconbtn" onClick={() => setModelPanel(true)} title="切换模型">
            <Icons.Settings size={16} />
          </button>
          <button className="vc-iconbtn" onClick={() => setFilePanel(true)} title="文件">
            <Icons.FolderTree size={16} />
          </button>
        </div>
      </header>

      {bannerError && <Banner prefix="vc" message={bannerError} onDismiss={dismissBannerError} />}

      <MessageList
        prefix="vc"
        className="vc-canvas"
        messages={session.messages}
        streamingMessage={session.streamingMessage}
        empty={
          <div className="vc-empty">
            <div className="vc-empty-title">向 Pi 提问</div>
            <div className="vc-empty-sub">选择会话或直接输入开始对话</div>
          </div>
        }
      />

      <Composer
        prefix="vc"
        disabled={!session.rpcSessionId}
        isStreaming={session.isStreaming}
        placeholder={session.rpcSessionId ? "输入消息…" : "先选择会话"}
        onSend={session.sendPrompt}
        onAbort={session.abort}
      />

      {/* 会话抽屉 */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="vc-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              className="vc-drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="vc-drawer-header">
                <span>会话</span>
                <button
                  className="vc-drawer-new"
                  disabled={!sessions.projectRoot}
                  onClick={() => {
                    setDrawerOpen(false);
                    void session.newSession(sessions.projectRoot ?? "");
                  }}
                >
                  <Icons.Plus size={13} /> 新建
                </button>
              </div>
              <div className="vc-drawer-list">
                {!sessions.projectRoot && (
                  <button
                    className="vc-drawer-pick"
                    onClick={() => void sessions.pickDirectory().then((d) => d && fileTree.setRoot(d))}
                  >
                    <Icons.Folder size={14} /> 选择项目目录
                  </button>
                )}
                {sessions.sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`vc-drawer-item ${session.session?.id === s.id ? "vc-drawer-item-active" : ""}`}
                    onClick={() => void pickSession(s)}
                  >
                    <div className="vc-drawer-item-name">{s.name || s.firstMessage || "(无消息)"}</div>
                    <div className="vc-drawer-item-meta">
                      {s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? "?"} · {s.messageCount} 条
                    </div>
                  </div>
                ))}
                {sessions.sessions.length === 0 && <div className="vc-drawer-empty">暂无会话</div>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 模型浮层 */}
      <AnimatePresence>
        {modelPanel && (
          <>
            <motion.div
              className="vc-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setModelPanel(false)}
            />
            <motion.div
              className="vc-sheet"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="vc-sheet-header">
                <span>切换模型</span>
                <button className="vc-iconbtn" onClick={() => setModelPanel(false)}>
                  <Icons.X size={16} />
                </button>
              </div>
              <div className="vc-sheet-body">
                <ModelList
                  prefix="vc"
                  grouped={models.grouped}
                  activeModel={session.state?.model}
                  disabled={!session.rpcSessionId}
                  onSelect={(provider, modelId) => {
                    setModelPanel(false);
                    return session.setModel(provider, modelId);
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 文件浮层 */}
      <AnimatePresence>
        {filePanel && (
          <>
            <motion.div
              className="vc-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setFilePanel(false)}
            />
            <motion.div
              className="vc-sheet vc-sheet-wide"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="vc-sheet-header">
                <span>文件</span>
                <button className="vc-iconbtn" onClick={() => setFilePanel(false)}>
                  <Icons.X size={16} />
                </button>
              </div>
              <div className="vc-sheet-body vc-files">
                {!fileTree.root ? (
                  <div className="vc-files-empty">
                    <button
                      onClick={() => void sessions.pickDirectory().then((d) => d && fileTree.setRoot(d))}
                    >
                      <Icons.Folder size={14} /> 选择项目目录
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="vc-files-tree">
                      <TreeView
                        prefix="vc"
                        nodes={fileTree.tree}
                        selectedPath={fileTree.selectedFile?.path ?? null}
                        onToggle={fileTree.toggleDir}
                        onSelect={fileTree.selectFile}
                      />
                    </div>
                    {fileTree.selectedFile && (
                      <div className="vc-files-preview">
                        <div className="vc-files-preview-title">{fileTree.selectedFile.name}</div>
                        <pre>{fileTree.fileContent?.content ?? ""}</pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
