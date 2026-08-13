import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, GitFork, RefreshCw, User, Wrench, X } from "lucide-react";
import { forwardRef, useState } from "react";

import { MapleStatusMark } from "../MapleStatusMark";
import {
  type ConversationItem,
  type ConversationRole,
} from "../conversationState";

export type { ConversationItem, ConversationRole, MessageStatus } from "../conversationState";

interface ToolCallInfo {
  callId: string;
  name: string;
  args?: unknown;
  startedAt?: string;
  finishedAt?: string;
  isError?: boolean;
  result?: unknown;
}

export type { ToolCallInfo, ApprovalInfo };

interface ApprovalInfo {
  requestId: string;
  kind: "confirm" | "select" | "input";
  title: string;
  message: string;
  safeLabel?: string;
  impact?: string;
  options?: string[];
  status: "pending" | "resolved";
}

interface ConversationLogProps {
  items: ConversationItem[];
  toolCalls: ToolCallInfo[];
  loading: boolean;
  streamStatus: "connecting" | "idle" | "streaming" | "error";
  approvals: ApprovalInfo[];
  streamError: string | null;
  busyCommand: string | null;
  hasTask: boolean;
  showThinking: boolean;
  onCopy: (text: string) => void;
  onFork: (entryId: string) => void;
  onResend: (itemId: string, text: string) => void;
  onApproval: (requestId: string, decision: "approve" | "reject", value?: string) => void;
}

const ROLE_LABEL: Record<ConversationRole, string> = {
  user: "你",
  assistant: "Agent",
  tool: "工具",
};

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const candidate = block as { type?: string; text?: string; thinking?: string; content?: unknown };
      if (candidate.type === "text" && typeof candidate.text === "string") return candidate.text;
      if (candidate.type === "thinking") return "";
      return typeof candidate.content === "string" ? candidate.content : "";
    }).filter(Boolean).join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function contentToThinking(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (!block || typeof block !== "object") return "";
    const candidate = block as { type?: string; thinking?: string };
    return candidate.type === "thinking" && typeof candidate.thinking === "string" ? candidate.thinking : "";
  }).filter(Boolean).join("");
}

export function normalizeConversationMessage(message: unknown, index: number): ConversationItem | null {
  const candidate = message as { id?: string; role?: string; content?: unknown };
  const text = contentToText(candidate.content).trim();
  const thinking = contentToThinking(candidate.content).trim();
  if (!text && !thinking) return null;
  const role: ConversationRole = candidate.role === "user" ? "user" : candidate.role === "assistant" ? "assistant" : "tool";
  return {
    id: candidate.id ?? `${role}-${index}`,
    role,
    text,
    ...(thinking ? { thinking } : {}),
  };
}

export { mergeConversation } from "../conversationState";

export const STREAMING_MESSAGE_ID = "__streaming_assistant__";

export function getTextDelta(event: { type: string; data?: unknown }): string | null {
  if (event.type !== "message_delta") return null;
  const data = event.data as { delta?: unknown } | undefined;
  return data && typeof data.delta === "string" ? data.delta : null;
}

export function getThinkingDelta(event: { type: string; data?: unknown }): string | null {
  if (event.type !== "thinking_delta") return null;
  const data = event.data as { delta?: unknown } | undefined;
  return data && typeof data.delta === "string" ? data.delta : null;
}

function ConversationMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer">{children}</a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function RoleIcon({ role }: { role: ConversationRole }) {
  if (role === "user") return <User size={14} aria-hidden="true" />;
  if (role === "tool") return <Wrench size={14} aria-hidden="true" />;
  return <MapleStatusMark className="conversation-message__yunfeng-mark" />;
}

function ApprovalCard({
  approval,
  busy,
  onApprove,
  onReject,
}: {
  approval: ApprovalInfo;
  busy: boolean;
  onApprove: (value?: string) => void;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState<string>("");
  const needsInput = approval.kind !== "confirm";
  return (
    <article className={`approval-card approval-card--${approval.kind}`}>
      <p className="approval-card__eyebrow">需要你审批 · {approval.kind === "confirm" ? "确认" : approval.kind === "select" ? "选择" : "输入"}</p>
      <h4 className="approval-card__title">{approval.title}</h4>
      {approval.message ? <p className="approval-card__message">{approval.message}</p> : null}
      {approval.safeLabel ? <p className="approval-card__impact">操作：{approval.safeLabel}</p> : null}
      {approval.impact ? <p className="approval-card__impact">影响范围：{approval.impact}</p> : null}
      {approval.kind === "select" && approval.options && approval.options.length > 0 ? (
        <select className="approval-card__select" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy}>
          <option value="">请选择…</option>
          {approval.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : null}
      {approval.kind === "input" ? (
        <input
          className="approval-card__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="输入内容"
          disabled={busy}
        />
      ) : null}
      <div className="approval-card__actions">
        <button className="button button--quiet" type="button" onClick={onReject} disabled={busy}>
          <X size={13} aria-hidden="true" /> 拒绝
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={() => onApprove(needsInput && draft ? draft : undefined)}
          disabled={busy || (needsInput && approval.kind === "select" && !draft)}
        >
          <Check size={13} aria-hidden="true" /> {approval.kind === "confirm" ? "允许一次" : "提交"}
        </button>
      </div>
    </article>
  );
}

export const ConversationLog = forwardRef<HTMLDivElement, ConversationLogProps>(function ConversationLog(
  { items, toolCalls, loading, streamStatus, approvals, busyCommand, hasTask, showThinking, onCopy, onFork, onResend, onApproval, streamError },
  ref,
) {
  const visibleItems = items.filter((item) => item.role !== "tool");

  return (
    <div ref={ref} className="conversation-log" role="log" aria-label="任务对话" aria-live="polite">
      {loading ? <p className="conversation-placeholder">正在读取会话记录…</p> : null}
      {!loading && visibleItems.length === 0 ? <p className="conversation-placeholder">这段会话还没有可展示的消息。</p> : null}

      {visibleItems.map((item) => (
        <article
          key={item.id}
          className={`conversation-message conversation-message--${item.role} ${item.streaming ? "conversation-message--streaming" : ""} ${item.status === "failed" ? "conversation-message--failed" : ""}`.trim()}
        >
          <span className="conversation-message__role">
            <RoleIcon role={item.role} />
            <span className="conversation-message__role-label">{ROLE_LABEL[item.role]}</span>
          </span>
          <div className="conversation-message__content">
            {showThinking && item.thinking ? (
              <div className="conversation-message__thinking">
                <span>思考过程</span>
                <ConversationMarkdown text={item.thinking} />
              </div>
            ) : null}
            {item.text ? <ConversationMarkdown text={item.text} /> : null}
            {item.role === "user" && item.status ? (
              <span className={`conversation-message__delivery conversation-message__delivery--${item.status}`}>
                <span className={`message-dot message-dot--${item.status}`} aria-hidden="true" />
                {item.status === "failed" ? "发送失败" : item.status === "sending" ? "发送中" : "已发送"}
              </span>
            ) : null}
          </div>
          <div className="conversation-message__actions">
            <button type="button" className="text-button" onClick={() => onCopy(item.text)}>
              <Copy size={12} aria-hidden="true" /> 复制
            </button>
            {item.role === "assistant" && hasTask ? (
              <button type="button" className="text-button" onClick={() => onFork(item.id)}>
                <GitFork size={12} aria-hidden="true" /> 从此分支
              </button>
            ) : null}
            {item.role === "user" && item.status === "failed" ? (
              <button type="button" className="text-button" onClick={() => onResend(item.id, item.text)}>
                <RefreshCw size={12} aria-hidden="true" /> 重新发送
              </button>
            ) : null}
          </div>
        </article>
      ))}

      {toolCalls.map((call) => (
        <article key={call.callId} className="tool-card tool-card--running" aria-label={`正在调用工具：${call.name}`}>
          <div className="tool-card__summary">
            <span className="tool-card__name"><Wrench size={13} aria-hidden="true" /> {call.name}</span>
            <span className="tool-card__status">调用中</span>
          </div>
        </article>
      ))}

      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.requestId}
          approval={approval}
          busy={busyCommand === `approval-${approval.requestId}`}
          onApprove={(value) => onApproval(approval.requestId, "approve", value)}
          onReject={() => onApproval(approval.requestId, "reject")}
        />
      ))}

      {streamError ? <p className="conversation-error" role="alert">{streamError}</p> : null}
      <span className="sr-only">{streamStatus === "streaming" ? "Agent 正在回复" : "对话实时同步"}</span>
    </div>
  );
});
