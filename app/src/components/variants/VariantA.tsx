// 变体 A：命令面板主导。无侧边栏，单栏对话画布，
// 会话/文件/模型统一收进 ⌘K 风格命令面板。
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Composer } from "../Composer";
import { MessageList } from "../MessageList";
import { Banner } from "../Banner";
import { Icons } from "../Icons";
import { openSessionAndSyncTree } from "../../lib/sessionActions";
import type { SessionInfo } from "../../lib/types";
import type { VariantProps } from "./variantTypes";

type PanelTab = "sessions" | "files" | "models";

export function VariantA({ sessions, session, fileTree, models, bannerError, dismissBannerError }: VariantProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("sessions");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPanelOpen((o) => !o);
      }
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (panelOpen) setTimeout(() => inputRef.current?.focus(), 30);
    else setQuery("");
  }, [panelOpen]);

  const q = query.trim().toLowerCase();
  const filteredSessions = sessions.sessions.filter(
    (s) => !q || (s.name || s.firstMessage || "").toLowerCase().includes(q),
  );
  const filteredFiles = fileTree.tree.filter((n) => !q || n.name.toLowerCase().includes(q));
  const filteredModels = models.grouped
    .flatMap((g) => g.models.map((m) => ({ ...m, providerName: g.providerName, configured: g.configured })))
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));

  const pickSession = async (s: SessionInfo) => {
    setPanelOpen(false);
    try {
      await openSessionAndSyncTree(s, sessions, session, fileTree);
    } catch {
      // 打开失败由 session.error 呈现
    }
  };

  const currentModel = models.findModel(session.state?.model?.provider, session.state?.model?.id);

  return (
    <div className="va-shell">
      <header className="va-topbar">
        <span className="va-brand">Pi</span>
        <button className="va-context" onClick={() => setPanelOpen(true)}>
          <span className="va-context-title">
            {session.session?.name || (session.rpcSessionId ? "当前会话" : "未选择会话")}
          </span>
          <span className="va-context-sub">
            {currentModel ? currentModel.name : "⌘K 打开面板"}
          </span>
        </button>
        <button className="va-kbd" onClick={() => setPanelOpen(true)} title="打开命令面板 (⌘K)">
          <Icons.Command size={12} /> K
        </button>
      </header>

      {bannerError && <Banner prefix="va" message={bannerError} onDismiss={dismissBannerError} />}

      <MessageList
        prefix="va"
        className="va-canvas"
        messages={session.messages}
        streamingMessage={session.streamingMessage}
        showRoleLabels
        bodyClass="va-msg-body"
        empty={
          <div className="va-empty">
            <div className="va-empty-title">开始一次对话</div>
            <div className="va-empty-sub">
              按 <kbd>⌘K</kbd> 选择会话、浏览文件或切换模型
            </div>
          </div>
        }
      />

      <Composer
        prefix="va"
        disabled={!session.rpcSessionId}
        isStreaming={session.isStreaming}
        placeholder={session.rpcSessionId ? "输入消息…" : "先选择一个会话或项目"}
        onSend={session.sendPrompt}
        onAbort={session.abort}
      />

      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              className="va-panel-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setPanelOpen(false)}
            />
            <motion.div
              className="va-panel"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
            <div className="va-panel-tabs">
              {(["sessions", "files", "models"] as PanelTab[]).map((t) => (
                <button
                  key={t}
                  className={`va-tab ${tab === t ? "va-tab-active" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t === "sessions" ? "会话" : t === "files" ? "文件" : "模型"}
                </button>
              ))}
            </div>
            <input
              ref={inputRef}
              className="va-panel-search"
              placeholder="搜索…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="va-panel-list">
              {tab === "sessions" && (
                <>
                  <button
                    className="va-panel-item"
                    disabled={!sessions.projectRoot}
                    onClick={() => {
                      setPanelOpen(false);
                      void session.newSession(sessions.projectRoot ?? "");
                    }}
                  >
                    <span className="va-panel-item-main">
                      <Icons.Plus size={14} /> 新建会话
                    </span>
                  </button>
                  {filteredSessions.map((s) => (
                    <button
                      key={s.id}
                      className={`va-panel-item ${session.session?.id === s.id ? "va-panel-item-active" : ""}`}
                      onClick={() => void pickSession(s)}
                    >
                      <span className="va-panel-item-main">{s.name || s.firstMessage || "(无消息)"}</span>
                      <span className="va-panel-item-sub">
                        {s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? "?"} · {s.messageCount} 条
                      </span>
                    </button>
                  ))}
                  {filteredSessions.length === 0 && (
                    <div className="va-panel-empty">没有匹配的会话</div>
                  )}
                </>
              )}

              {tab === "files" && (
                <>
                  {!fileTree.root && (
                    <button
                      className="va-panel-item"
                      onClick={() => {
                        setPanelOpen(false);
                        void sessions.pickDirectory().then((d) => {
                          if (d) {
                            localStorage.setItem("pi-project-root", d);
                            fileTree.setRoot(d);
                          }
                        });
                      }}
                    >
                      <span className="va-panel-item-main">
                        <Icons.Folder size={14} /> 选择项目目录
                      </span>
                    </button>
                  )}
                  {filteredFiles.map((n) => (
                    <button
                      key={n.path}
                      className="va-panel-item"
                      onClick={() => {
                        setPanelOpen(false);
                        if (n.type === "dir") void fileTree.toggleDir(n);
                        else void fileTree.selectFile(n);
                      }}
                    >
                      <span className="va-panel-item-main">
                        {n.type === "dir" ? <Icons.Folder size={14} /> : <Icons.File size={14} />} {n.name}
                      </span>
                    </button>
                  ))}
                  {filteredFiles.length === 0 && fileTree.root && (
                    <div className="va-panel-empty">没有匹配的文件</div>
                  )}
                </>
              )}

              {tab === "models" &&
                filteredModels.map((m) => (
                  <button
                    key={`${m.provider}/${m.id}`}
                    className={`va-panel-item ${session.state?.model?.id === m.id && session.state?.model?.provider === m.provider ? "va-panel-item-active" : ""}`}
                    onClick={() => {
                      setPanelOpen(false);
                      if (session.rpcSessionId) void session.setModel(m.provider, m.id);
                    }}
                  >
                    <span className="va-panel-item-main">
                      {m.name}
                      {!m.configured && <span className="va-badge">未配置</span>}
                    </span>
                    <span className="va-panel-item-sub">{m.providerName}</span>
                  </button>
                ))}
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}
