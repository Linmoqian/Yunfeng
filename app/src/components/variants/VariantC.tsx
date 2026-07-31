// 变体 C：沉浸式对话。全屏消息流，会话走左侧滑出抽屉，
// 文件与模型走浮层。强调专注与对话连续性。
import { useEffect, useRef, useState } from "react";
import { MessageBody } from "../Markdown";
import type { SessionInfo } from "../../lib/types";
import type { VariantProps } from "./variantTypes";

export function VariantC({
  sessions,
  session,
  fileTree,
  models,
  bannerError,
  dismissBannerError,
}: VariantCProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filePanel, setFilePanel] = useState(false);
  const [modelPanel, setModelPanel] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [session.messages, session.streamingMessage]);

  const pickSession = async (s: SessionInfo) => {
    setDrawerOpen(false);
    const cwd = s.cwd ?? sessions.projectRoot ?? "";
    if (!cwd) return;
    try {
      await session.openSession(s, cwd);
      if (sessions.projectRoot !== cwd) fileTree.setRoot(cwd);
    } catch {
      // 错误由 session.error 呈现
    }
  };

  const currentModel =
    session.state?.model &&
    models.grouped
      .find((g) => g.providerId === session.state?.model?.provider)
      ?.models.find((m) => m.id === session.state?.model?.id);

  return (
    <div className="vc-shell">
      <header className="vc-topbar">
        <button className="vc-iconbtn" onClick={() => setDrawerOpen(true)} title="会话列表">
          ☰
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
            ⚙
          </button>
          <button className="vc-iconbtn" onClick={() => setFilePanel(true)} title="文件">
            📁
          </button>
        </div>
      </header>

      {bannerError && (
        <div className="vc-banner">
          {bannerError}
          <button onClick={dismissBannerError}>✕</button>
        </div>
      )}

      <div className="vc-canvas" ref={scrollRef}>
        {session.messages.length === 0 && !session.streamingMessage && (
          <div className="vc-empty">
            <div className="vc-empty-title">向 Pi 提问</div>
            <div className="vc-empty-sub">选择会话或直接输入开始对话</div>
          </div>
        )}
        {[...session.messages, ...(session.streamingMessage ? [session.streamingMessage] : [])].map(
          (m, i) => (
            <div key={i} className={`vc-msg vc-msg-${m.role}`}>
              <MessageBody message={m} />
              {session.streamingMessage === m && m.role === "assistant" && (
                <span className="cursor-blink" />
              )}
            </div>
          ),
        )}
      </div>

      <form
        className="vc-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || !session.rpcSessionId) return;
          void session.sendPrompt(input.trim());
          setInput("");
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={session.rpcSessionId ? "输入消息…" : "先选择会话"}
          disabled={!session.rpcSessionId}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
        />
        {session.isStreaming ? (
          <button type="button" className="vc-send" onClick={() => void session.abort()}>
            停止
          </button>
        ) : (
          <button type="submit" className="vc-send" disabled={!session.rpcSessionId}>
            发送
          </button>
        )}
      </form>

      {/* 会话抽屉 */}
      {drawerOpen && (
        <>
          <div className="vc-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="vc-drawer">
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
                ＋ 新建
              </button>
            </div>
            <div className="vc-drawer-list">
              {!sessions.projectRoot && (
                <button
                  className="vc-drawer-pick"
                  onClick={() => void sessions.pickDirectory().then((d) => d && fileTree.setRoot(d))}
                >
                  📁 选择项目目录
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
          </div>
        </>
      )}

      {/* 模型浮层 */}
      {modelPanel && (
        <>
          <div className="vc-overlay" onClick={() => setModelPanel(false)} />
          <div className="vc-sheet">
            <div className="vc-sheet-header">
              <span>切换模型</span>
              <button className="vc-iconbtn" onClick={() => setModelPanel(false)}>
                ✕
              </button>
            </div>
            <div className="vc-sheet-body">
              {models.grouped.map((g) => (
                <div key={g.providerId}>
                  <div className="vc-model-group">{g.providerName}</div>
                  {g.models.map((m) => (
                    <button
                      key={m.id}
                      className={`vc-model-item ${session.state?.model?.id === m.id ? "vc-model-item-active" : ""}`}
                      onClick={() => {
                        if (session.rpcSessionId) void session.setModel(m.provider, m.id);
                        setModelPanel(false);
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 文件浮层 */}
      {filePanel && (
        <>
          <div className="vc-overlay" onClick={() => setFilePanel(false)} />
          <div className="vc-sheet vc-sheet-wide">
            <div className="vc-sheet-header">
              <span>文件</span>
              <button className="vc-iconbtn" onClick={() => setFilePanel(false)}>
                ✕
              </button>
            </div>
            <div className="vc-sheet-body vc-files">
              {!fileTree.root ? (
                <div className="vc-files-empty">
                  <button
                    onClick={() => void sessions.pickDirectory().then((d) => d && fileTree.setRoot(d))}
                  >
                    📁 选择项目目录
                  </button>
                </div>
              ) : (
                <>
                  <div className="vc-files-tree">
                    {fileTree.tree.map((n) => (
                      <VcNode
                        key={n.path}
                        node={n}
                        depth={0}
                        onToggle={fileTree.toggleDir}
                        onSelect={fileTree.selectFile}
                        selectedPath={fileTree.selectedFile?.path ?? null}
                      />
                    ))}
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
          </div>
        </>
      )}
    </div>
  );
}

interface VariantCProps extends Omit<VariantProps, "sidecar"> {}

function VcNode({
  node,
  depth,
  onToggle,
  onSelect,
  selectedPath,
}: {
  node: { name: string; path: string; type: "file" | "dir"; children?: unknown[]; expanded?: boolean; size: number };
  depth: number;
  onToggle: (n: { name: string; path: string; type: "file" | "dir"; size: number }) => Promise<void>;
  onSelect: (n: { name: string; path: string; type: "file" | "dir"; size: number }) => Promise<void>;
  selectedPath: string | null;
}) {
  const isDir = node.type === "dir";
  return (
    <>
      <div
        className={`vc-node ${selectedPath === node.path ? "vc-node-selected" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => (isDir ? void onToggle(node) : void onSelect(node))}
      >
        <span>{isDir ? (node.expanded ? "📂" : "📁") : "📄"}</span>
        <span className="vc-node-name">{node.name}</span>
      </div>
      {isDir &&
        node.expanded &&
        (node.children as typeof node[] | undefined)?.map((c) => (
          <VcNode
            key={c.path}
            node={c}
            depth={depth + 1}
            onToggle={onToggle}
            onSelect={onSelect}
            selectedPath={selectedPath}
          />
        ))}
    </>
  );
}
