import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { UseSessionResult } from "@/hooks/useSession";
import type { UseModelsResult } from "@/hooks/useModels";
import { MessageRow } from "./MessageRow";
import { Composer } from "./Composer";
import { ModelMenu } from "./ModelMenu";

interface ChatPanelProps {
  session: UseSessionResult;
  models: UseModelsResult;
  onPickDirectory: () => void;
}

const QUICK_PROMPTS = [
  { label: "⚡ 分析项目架构", text: "分析当前项目结构并给出优化方案" },
  { label: "💡 解释核心逻辑", text: "解释当前项目的核心代码逻辑" },
];

/** 主区：对话头部（会话名 + 模型）+ 消息流 + 输入条。 */
export function ChatPanel({ session, models, onPickDirectory }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [session.messages, session.streamingMessage]);

  const currentModel = models.findModel(session.state?.model?.provider, session.state?.model?.id);
  const allMessages = session.streamingMessage
    ? [...session.messages, session.streamingMessage]
    : session.messages;
  const hasSession = Boolean(session.rpcSessionId);
  const isBusy = session.isStreaming || session.runningTools.length > 0;

  return (
    <>
      <div className="chat-header" data-tauri-drag-region>
        <div className="chat-header-inner">
          <div className="chat-title">
            <strong>{session.session?.name || (hasSession ? "当前会话" : "Yunfeng")}</strong>
            <span>
              {hasSession && <span className="chat-status-dot" />}
              {isBusy
                ? session.runningTools.map((t) => t.name).join(", ") || "思考中…"
                : currentModel
                  ? currentModel.name
                  : "未选择模型"}
            </span>
          </div>
          <ModelMenu
            grouped={models.grouped}
            currentModel={currentModel}
            disabled={!hasSession}
            onSelect={session.setModel}
          />
        </div>
      </div>

      <div ref={scrollRef} className="message-stream">
        {allMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Sparkles size={22} />
            </div>
            <h2>Yunfeng 编码助手</h2>
            <p>选择左侧会话或新建会话开始对话，可随时切换基座模型。</p>
            <div className="quick-prompts">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  type="button"
                  className="quick-prompt"
                  disabled={!hasSession}
                  onClick={() => void session.sendPrompt(p.text)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          allMessages.map((m, i) => (
            <MessageRow key={i} message={m} streaming={session.streamingMessage === m} />
          ))
        )}
      </div>

      <Composer
        disabled={!hasSession}
        isStreaming={session.isStreaming}
        onSend={session.sendPrompt}
        onAbort={session.abort}
        onAttach={onPickDirectory}
      />
    </>
  );
}
