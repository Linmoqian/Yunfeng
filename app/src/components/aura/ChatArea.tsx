// Aura 主工作区：上下文横幅（会话名 + 模型切换）+ 消息流 + 浮动输入条。
import { useEffect, useRef } from "react";
import type { UseSessionResult } from "../../hooks/useSession";
import type { UseModelsResult } from "../../hooks/useModels";
import { Icons } from "../Icons";
import { Composer } from "./Composer";
import { ModelMenu } from "./ModelMenu";
import { MessageBubble } from "./MessageBubble";

interface ChatAreaProps {
  session: UseSessionResult;
  models: UseModelsResult;
  bannerError: string | null;
  onDismissBanner: () => void;
  onPickDirectory: () => Promise<void>;
}

const QUICK_PROMPTS = [
  { label: "⚡ 分析项目架构", text: "分析当前项目结构并给出优化方案" },
  { label: "🎨 Apple 设计规范", text: "提炼极简 Apple 设计系统的核心视觉原则" },
];

export function ChatArea({ session, models, bannerError, onDismissBanner, onPickDirectory }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [session.messages, session.streamingMessage]);

  const currentModel = models.findModel(session.state?.model?.provider, session.state?.model?.id);
  const allMessages = session.streamingMessage
    ? [...session.messages, session.streamingMessage]
    : session.messages;

  return (
    <div className="flex-1 flex flex-col justify-between relative bg-slate-50 overflow-hidden">
      {/* 错误横幅 */}
      {bannerError && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-200/60 text-red-600 text-xs flex items-center justify-between z-10">
          <span className="truncate">{bannerError}</span>
          <button onClick={onDismissBanner} className="ml-3 shrink-0 hover:text-red-800">
            ✕
          </button>
        </div>
      )}

      {/* 上下文横幅：会话名 + 就绪徽章 + 模型切换 */}
      <div className="px-6 py-3 border-b border-slate-200/60 flex items-center justify-between bg-slate-100 apple-glass-subtle z-10">
        <div className="flex items-center space-x-3 min-w-0">
          <h2 className="text-base font-semibold text-slate-800 truncate">
            {session.session?.name || (session.rpcSessionId ? "当前会话" : "未选择会话")}
          </h2>
          {session.rpcSessionId && (
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-indigo-50 text-indigo-600 font-pixel border border-indigo-100 shrink-0">
              就绪
            </span>
          )}
          {(session.isStreaming || session.runningTools.length > 0) && (
            <span className="text-[11px] text-slate-400 truncate">
              {session.runningTools.map((t) => t.name).join(", ") || "思考中…"}
            </span>
          )}
        </div>
        <ModelMenu
          grouped={models.grouped}
          currentModel={currentModel}
          disabled={!session.rpcSessionId}
          onSelect={session.setModel}
        />
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {allMessages.length === 0 ? (
          <div className="max-w-md mx-auto my-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 mx-auto shadow-apple-glow animate-subtle-pulse">
              <div className="w-full h-full bg-slate-100 rounded-[14px] flex items-center justify-center text-indigo-600">
                <Icons.Sparkles className="w-7 h-7" />
              </div>
            </div>
            <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
              极简主义 AI Agent 桌面
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              清爽轻盈的交互界面，随意切换基座模型与多 Agent 协同。
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  onClick={() => void session.sendPrompt(p.text)}
                  disabled={!session.rpcSessionId}
                  className="px-3 py-1.5 rounded-full bg-slate-200 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200/80 text-xs text-slate-600 transition shadow-sm pixel-press disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col space-y-4 max-w-3xl mx-auto">
            {allMessages.map((m, i) => (
              <MessageBubble key={i} message={m} streaming={session.streamingMessage === m} />
            ))}
          </div>
        )}
      </div>

      <Composer
        disabled={!session.rpcSessionId}
        isStreaming={session.isStreaming}
        onSend={session.sendPrompt}
        onAbort={session.abort}
        onAttach={() => void onPickDirectory()}
      />
    </div>
  );
}
