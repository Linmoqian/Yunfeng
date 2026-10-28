/* 通用对话日志，科研正文与待确认计划通过独立呈现组件接入。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, GitFork, RefreshCw, User, Wrench, X } from "lucide-react";
import { forwardRef, Fragment, useState, type ReactNode } from "react";

import { Capsule, Details, MapleCloudLoading } from "../../../components/common";
import { ConversationLoading } from "./ConversationLoading";
import { ThinkingActivity } from "./ThinkingActivity";
import { ResearchApprovalPlan, ResearchMessage } from "./ResearchMessage";
import {
  type ConversationItem,
  type ConversationRole,
} from "../conversationState";

export type { ConversationItem, ConversationRole, MessageStatus } from "../conversationState";

import { ToolFeedback } from "./ToolFeedback";
import type { ToolCallInfo } from "../toolFeedback";

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
  research?: boolean;
  activity?: ReactNode;
  items: ConversationItem[];
  toolCalls: ToolCallInfo[];
  loading: boolean;
  running?: boolean;
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

export { normalizeConversationMessage, normalizeConversationMessages } from "../conversationMessages";

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

function streamingMarkdown(text: string): string {
  // 加粗标记可能跨增量到达；只临时补齐行尾未闭合标记，不修改原始消息。
  if ((text.match(/(?<!\\)`/g)?.length ?? 0) % 2 !== 0) return text;
  return /(^|[^\\`])\*\*\S[^*\n]*\S$|(^|[^\\`])\*\*\S$/.test(text) ? `${text}**` : text;
}

function ConversationMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer">{children}</a>
        ),
      }}
    >
      {streaming ? streamingMarkdown(text) : text}
    </ReactMarkdown>
  );
}

function RoleIcon({ role }: { role: ConversationRole }) {
  if (role === "user") return <User size={14} aria-hidden="true" />;
  if (role === "tool") return <Wrench size={14} aria-hidden="true" />;
  return null;
}

function ApprovalCard({
  approval,
  research,
  busy,
  onApprove,
  onReject,
}: {
  approval: ApprovalInfo;
  research?: boolean;
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
      {approval.message ? research && approval.title === "执行科研计划" ? <ResearchApprovalPlan message={approval.message} /> : <p className="approval-card__message">{approval.message}</p> : null}
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
  { items, research, activity, toolCalls, loading, running, streamStatus, approvals, busyCommand, hasTask, showThinking, onCopy, onFork, onResend, onApproval, streamError },
  ref,
) {
  const visibleItems = items.filter((item) => item.role !== "tool");
  const historicalIds = new Set(visibleItems.flatMap((item) => item.toolCalls?.map((call) => call.callId) ?? []));
  const liveById = new Map(toolCalls.map((call) => [call.callId, call]));
  const toolRunning = toolCalls.some((call) => !call.finishedAt);
  const replying = items.some((item) => item.streaming && item.text);
  const thinkingActive = Boolean(running && !research && !toolRunning && !replying);
  const liveThinking = thinkingActive ? visibleItems.find((item) => item.streaming && item.thinking) : undefined;

  return (
    <div ref={ref} className="conversation-log" role="log" aria-label="任务对话" aria-live="polite">
      {(loading || streamStatus === "connecting") ? <ConversationLoading /> : null}
      {!loading && !streamError && visibleItems.length === 0 ? <p className="conversation-placeholder">这段会话还没有可展示的消息。</p> : null}

      {visibleItems.map((item) => (
        <Fragment key={item.id}>
        {(item.text || (item.thinking && item !== liveThinking) || item.role === "user") && <article
          className={`conversation-message conversation-message--${item.role} ${item.streaming ? "conversation-message--streaming" : ""} ${item.status === "failed" ? "conversation-message--failed" : ""}`.trim()}
        >
          {item.role !== "assistant" ? <span className="conversation-message__role">
            <RoleIcon role={item.role} />
            <span className="conversation-message__role-label">{ROLE_LABEL[item.role]}</span>
          </span> : null}
          <div className="conversation-message__content">
            {item.thinking && !research && item !== liveThinking ? (
              <div className="conversation-message__thinking">
                <span>思考过程</span>
                <Details key={String(showThinking)} label="查看思考内容" defaultOpen={showThinking}>
                  <ConversationMarkdown text={item.thinking} />
                </Details>
              </div>
            ) : null}
            {item.text ? research && item.role === "assistant" ? <ResearchMessage text={item.text} /> : <ConversationMarkdown text={item.text} streaming={item.role === "assistant" && item.streaming} /> : null}
            {item.role === "user" && item.status && item.status !== "sent" ? (
              <span className={`conversation-message__delivery conversation-message__delivery--${item.status}`}>
                <span className={`message-dot message-dot--${item.status}`} aria-hidden="true" />
                {item.status === "failed" ? "发送失败" : "发送中"}
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
        </article>}
        {item.toolCalls?.length ? <ToolFeedback calls={item.toolCalls.map((call) => {
          const live = liveById.get(call.callId);
          return live && (live.finishedAt || call.outcome === "unknown") ? { ...call, ...live } : call;
        })} /> : null}
        </Fragment>
      ))}

      {thinkingActive ? <ThinkingActivity defaultOpen={showThinking}>
        {liveThinking?.thinking ? <ConversationMarkdown text={liveThinking.thinking} /> : null}
      </ThinkingActivity> : running && !research ? <Capsule className="conversation-message__activity" tone="accent" animateOnMount={false} status="running">
        <MapleCloudLoading compact />
        {toolRunning ? "正在调用工具" : "正在回复"}
      </Capsule> : null}
      <ToolFeedback calls={toolCalls.filter((call) => !historicalIds.has(call.callId))} />

      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.requestId}
          approval={approval}
          research={research}
          busy={busyCommand === `approval-${approval.requestId}`}
          onApprove={(value) => onApproval(approval.requestId, "approve", value)}
          onReject={() => onApproval(approval.requestId, "reject")}
        />
      ))}

      {activity}
      {streamError ? <p className="conversation-error" role="alert">{streamError}</p> : null}
      <span className="sr-only">{streamStatus === "streaming" ? "Agent 正在回复" : "对话实时同步"}</span>
    </div>
  );
});
