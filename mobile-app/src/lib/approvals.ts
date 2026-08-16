// 审批卡纯映射：把 SSE 事件 / 干预记录统一成 UI 卡片。
// 三种形态：confirm（同意/拒绝）、select（选项列表）、input（文本输入）。

export interface ApprovalCard {
  requestId: string;
  kind: "confirm" | "select" | "input";
  title: string;
  message: string;
  safeLabel?: string;
  impact?: string;
  options?: string[];
  defaultValue?: string;
}

interface RawApproval extends Partial<ApprovalCard> {
  /** 干预记录用 id 命名，事件负载用 requestId。 */
  id?: string;
}

/** 从 approval_requested 事件负载映射审批卡；缺失字段取安全默认值。 */
export function approvalFromEvent(data: unknown): ApprovalCard | null {
  if (!data || typeof data !== "object") return null;
  return approvalFromRaw(data as RawApproval);
}

/** 从干预记录（interventions API）映射审批卡。 */
export function approvalFromIntervention(item: RawApproval): ApprovalCard | null {
  return approvalFromRaw(item);
}

function approvalFromRaw(raw: RawApproval): ApprovalCard | null {
  const requestId = typeof raw.requestId === "string" ? raw.requestId : raw.id;
  if (typeof requestId !== "string") return null;
  return {
    requestId,
    kind: raw.kind ?? "confirm",
    title: raw.title ?? "Agent 请求审批",
    message: raw.message ?? "",
    ...(raw.safeLabel ? { safeLabel: raw.safeLabel } : {}),
    ...(raw.impact ? { impact: raw.impact } : {}),
    ...(Array.isArray(raw.options) ? { options: raw.options } : {}),
    ...(typeof raw.defaultValue === "string" ? { defaultValue: raw.defaultValue } : {}),
  };
}
