// 变体 A：命令面板主导。无侧边栏，单栏对话画布，
// 会话/文件/模型统一收进 ⌘K 风格命令面板。
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MessageBody } from "../Markdown";
import { Icons } from "../Icons";
import type { SessionInfo } from "../../lib/types";
import type { VariantProps } from "./variantTypes";

type PanelTab = "sessions" | "files" | "models";

export function VariantA({ sessions, session, fileTree, models, bannerError, dismissBannerError }: VariantProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("sessions");
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [session.messages, session.streamingMessage]);

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
    const cwd = s.cwd ?? sessions.projectRoot ?? "";
    if (!cwd) return;
    try {
      await session.openSession(s, cwd);
      if (sessions.projectRoot !== cwd) fileTree.setRoot(cwd);
    } catch {
      // 打开失败由 session.error 呈现
    }
  };

  const currentModel =
    session.state?.model &&
    models.grouped
      .find((g) => g.providerId === session.state?.model?.provider)
      ?.models.find((m) => m.id === session.state?.model?.id);

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

      {bannerError && (
        <div className="va-banner">
          {bannerError}
          <button onClick={dismissBannerError}>✕</button>
        </div>
      )}

      <div className="va-canvas" ref={scrollRef}>
        {session.messages.length === 0 && !session.streamingMessage && (
          <div className="va-empty">
            <div className="va-empty-title">开始一次对话</div>
            <div className="va-empty-sub">
              按 <kbd>⌘K</kbd> 选择会话、浏览文件或切换模型
            </div>
          </div>
        )}
        {[...session.messages, ...(session.streamingMessage ? [session.streamingMessage] : [])].map(
          (m, i) => (
            <div key={i} className={`va-msg va-msg-${m.role}`}>
              {m.role !== "user" && <div className="va-msg-role">{m.role === "assistant" ? "Pi" : "工具"}</div>}
              <div className="va-msg-body">
                <MessageBody message={m} />
                {session.streamingMessage === m && m.role === "assistant" && (
                  <span className="cursor-blink" />
                )}
              </div>
            </div>
          ),
        )}
      </div>

      <form
        className="va-composer"
        onSubmit={(e) => {
          e.preventDefault();
          const text = (e.currentTarget.elements.namedItem("msg") as HTMLTextAreaElement).value;
          if (!text.trim() || !session.rpcSessionId) return;
          (e.currentTarget.elements.namedItem("msg") as HTMLTextAreaElement).value = "";
          void session.sendPrompt(text.trim());
        }}
      >
        <textarea
          name="msg"
          placeholder={session.rpcSessionId ? "输入消息…" : "先选择一个会话或项目"}
          disabled={!session.rpcSessionId}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
        />
        {session.isStreaming ? (
          <button type="button" className="va-send" onClick={() => void session.abort()}>
            停止
          </button>
        ) : (
          <button type="submit" className="va-send" disabled={!session.rpcSessionId}>
            发送
          </button>
        )}
      </form>

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
