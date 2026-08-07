import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "motion/react";
import { Bot, Check, Loader2, Copy, GitFork, RefreshCw, User, Wrench, X } from "lucide-react";
import { forwardRef, useState } from "react";

export type ConversationRole = "user" | "assistant" | "tool";
export type MessageStatus = "sending" | "sent" | "failed" | undefined;

export interface ConversationItem {
  id: string;
  role: ConversationRole;
  text: string;
  streaming?: boolean;
  status?: MessageStatus;
}

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
  loading: boolean;
  streamStatus: "connecting" | "idle" | "streaming" | "error";
  toolActivity: string | null;
  toolCalls: ToolCallInfo[];
  approvals: ApprovalInfo[];
  streamError: string | null;
  busyCommand: string | null;
  hasTask: boolean;
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

export function normalizeConversationMessage(message: unknown, index: number): ConversationItem | null {
  const candidate = message as { id?: string; role?: string; content?: unknown };
  const text = contentToText(candidate.content).trim();
  if (!text) return null;
  const role: ConversationRole = candidate.role === "user" ? "user" : candidate.role === "assistant" ? "assistant" : "tool";
  return {
    id: candidate.id ?? `${role}-${index}`,
    role,
    text,
  };
}

export function mergeConversation(current: ConversationItem[], loaded: ConversationItem[]): ConversationItem[] {
  const loadedIds = new Set(loaded.map((message) => message.id));
  return [...loaded, ...current.filter((message) => message.id === STREAMING_MESSAGE_ID || !loadedIds.has(message.id))];
}

export const STREAMING_MESSAGE_ID = "__streaming_assistant__";

export function getTextDelta(event: { type: string; data?: unknown }): string | null {
  if (event.type !== "message_delta") return null;
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
  return <Bot size={14} aria-hidden="true" />;
}

function formatToolOutput(value: unknown, max = 800): string {
  if (value === undefined || value === null) return "";
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
  }
  return text.length > max ? `${text.slice(0, max)}…[截断]` : text;
}

function ToolCallCard({ call }: { call: ToolCallInfo }) {
  const running = !call.finishedAt;
  const args = formatToolOutput(call.args, 400);
  const output = call.result !== undefined ? formatToolOutput(call.result) : "";
  const tone = call.isError ? "error" : running ? "running" : "done";
  return (
    <details className={`tool-card tool-card--${tone}`} open={running}>
      <summary className="tool-card__summary">
        <span className="tool-card__name">
          <Wrench size={12} aria-hidden="true" /> {call.name}
        </span>
        <span className="tool-card__status">
          {running ? <Loader2 size={11} className="spin" aria-hidden="true" /> : null}
          {call.isError ? "失败" : running ? "运行中" : "完成"}
        </span>
      </summary>
      <div className="tool-card__body">
        {args ? <pre className="tool-card__args"><code>{args}</code></pre> : null}
        {output ? (
          <pre className="tool-card__output"><code>{output}</code></pre>
        ) : (
          <p className="tool-card__empty">该工具调用没有输出。</p>
        )}
      </div>
    </details>
  );
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
  { items, loading, streamStatus, toolActivity, toolCalls, approvals, busyCommand, hasTask, onCopy, onFork, onResend, onApproval, streamError },
  ref,
) {
  return (
    <div ref={ref} className="conversation-log" role="log" aria-label="任务对话" aria-live="polite">
      {loading ? <p className="conversation-placeholder">正在读取会话记录…</p> : null}
      {!loading && items.length === 0 ? <p className="conversation-placeholder">这段会话还没有可展示的消息。</p> : null}

      {items.map((item) => (
        <motion.article
          key={item.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className={`conversation-message conversation-message--${item.role} ${item.streaming ? "conversation-message--streaming" : ""} ${item.status === "failed" ? "conversation-message--failed" : ""}`.trim()}
        >
          <span className="conversation-message__role">
            <RoleIcon role={item.role} />
            <span className="conversation-message__role-label">{ROLE_LABEL[item.role]}</span>
            {item.status ? <span className={`message-dot message-dot--${item.status}`} aria-label={item.status === "failed" ? "发送失败" : item.status === "sending" ? "发送中" : "已发送"} /> : null}
          </span>
          <div className="conversation-message__content">
            <ConversationMarkdown text={item.text} />
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
        </motion.article>
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

      {toolCalls.map((call) => (
        <ToolCallCard key={call.callId} call={call} />
      ))}

      {toolActivity ? <p className="conversation-tool-status" role="status">{toolActivity}</p> : null}
      {streamError ? <p className="conversation-error" role="alert">{streamError}</p> : null}
      <span className="sr-only">{streamStatus === "streaming" ? "Agent 正在回复" : "对话实时同步"}</span>
    </div>
  );
});
