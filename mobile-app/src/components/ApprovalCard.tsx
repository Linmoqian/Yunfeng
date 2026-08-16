import { useState } from "react";
import { BadgeCheck, ListChecks, PencilLine } from "lucide-react";
import type { ApprovalCard as ApprovalCardData } from "@/lib/approvals";
import { Button } from "./ui/button";

interface ApprovalCardProps {
  approval: ApprovalCardData;
  onResolve: (requestId: string, decision: "approve" | "reject", value?: string) => void;
}

/** 单张审批卡：按 kind 渲染同意/拒绝、选项或文本输入。 */
export function ApprovalCard({ approval, onResolve }: ApprovalCardProps) {
  const [value, setValue] = useState(approval.defaultValue ?? "");
  const [submitting, setSubmitting] = useState(false);

  const resolve = (decision: "approve" | "reject", nextValue?: string) => {
    setSubmitting(true);
    onResolve(approval.requestId, decision, nextValue);
  };

  const kindIcon =
    approval.kind === "select" ? <ListChecks size={13} /> : approval.kind === "input" ? <PencilLine size={13} /> : <BadgeCheck size={13} />;

  // select 有选项时点选项即完成审批；选项缺失时退化为普通同意/拒绝。
  const hasOptions = approval.kind === "select" && (approval.options?.length ?? 0) > 0;

  return (
    <div className="approval-card">
      <div className="approval-kind">
        {kindIcon}
        {approval.kind === "select" ? "请选择" : approval.kind === "input" ? "需要填写" : "需要确认"}
        {approval.safeLabel && <span className="approval-safe-label">{approval.safeLabel}</span>}
      </div>
      <strong>{approval.title}</strong>
      {approval.impact && <span className="approval-impact">{approval.impact}</span>}
      <p>{approval.message}</p>

      {hasOptions && (
        <div className="approval-options">
          {(approval.options ?? []).map((option) => (
            <button
              key={option}
              type="button"
              className="approval-option"
              disabled={submitting}
              onClick={() => resolve("approve", option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {approval.kind === "input" && (
        <input
          className="approval-input"
          value={value}
          placeholder="输入后提交给 Agent"
          disabled={submitting}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim() !== "") resolve("approve", value.trim());
          }}
        />
      )}

      <div className="approval-actions">
        {approval.kind === "input" ? (
          <Button size="sm" disabled={submitting || value.trim() === ""} onClick={() => resolve("approve", value.trim())}>
            提交
          </Button>
        ) : (
          <Button size="sm" disabled={submitting || hasOptions} onClick={() => resolve("approve")}>
            同意
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={submitting} onClick={() => resolve("reject")}>
          拒绝
        </Button>
      </div>
    </div>
  );
}
