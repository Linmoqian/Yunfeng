/* 科研分类展示核心回归：不丢指标、授权内容与原始未知步骤。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchApprovalPlan, ResearchMessage } from "../src/features/workbench/components/ResearchMessage";
import { ConversationLog } from "../src/features/workbench/components/ConversationLog";

afterEach(cleanup);

test("结论胶囊只提取实测幅度与明确验收，全文折叠且限制始终可见", async () => {
  const text = "写入 config.json 并运行实验。实测结果：压缩至 20910 字节，相比基线减小约 14.4%，超过至少 1% 的目标；roundtrip=true。唯一验收条件 report.json:completed==1 实测通过（actual=1），节点目标达成。独立数据尚未验证，需要人工复核。";
  render(<ResearchMessage text={`实验结论：${text}`} />);
  expect(screen.getByText("减小约 14.4%")).toBeTruthy();
  expect(screen.getByText("验收通过")).toBeTruthy();
  expect(screen.getByText("解压一致")).toBeTruthy();
  expect(screen.getByText(/独立数据尚未验证，需要人工复核/)).toBeTruthy();
  expect(screen.queryByText(/写入 config.json/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "详细过程" }));
  expect(screen.getByText(/压缩至 20910 字节/)).toBeTruthy();
  expect(screen.getByText(/completed==1 实测通过（actual=1）/)).toBeTruthy();
  cleanup();
  render(<ResearchMessage text="实验结论：实测提升 2%，验收未通过，roundtrip=false。需要检查数据。" />);
  expect(screen.getByText("验收未通过")).toBeTruthy();
  expect(screen.queryByText("验收通过")).toBeNull();
  expect(screen.getByText("往返校验失败")).toBeTruthy();
  expect(screen.getByText(/需要检查数据/)).toBeTruthy();
  cleanup();
  render(<ResearchMessage text="实验结论：节点验收通过。压缩比约 35.45%，仅对当前语料有效。" />);
  expect(screen.getByText("节点验收通过")).toBeTruthy();
  expect(screen.getByText(/仅对当前语料有效/)).toBeTruthy();
  cleanup();
  render(<ResearchMessage text="实验结论：目标提升 10%，尚未验收通过。未提升 2%，要求 roundtrip=true。如果验收失败则复核。" />);
  expect(screen.queryByLabelText("关键指标")).toBeNull();
  expect(screen.getByText(/目标提升 10%，尚未验收通过/)).toBeTruthy();
});

test("结论保留实测结果，方式展开可查看原执行描述，风险不被折叠", async () => {
  render(<ResearchMessage text="实验结论：写入 config.json 并运行基线。实测结果：压缩至 20910 字节，独立数据尚未验证。" />);
  expect(screen.getByRole("region", { name: "结论" })).toBeTruthy();
  expect(screen.getByText(/20910 字节/)).toBeTruthy();
  expect(screen.queryByText(/写入 config.json/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "方式" }));
  expect(screen.getByText(/写入 config.json/)).toBeTruthy();
  cleanup();
  render(<ResearchMessage text="实验结论：运行有风险，需要确认。实测结果：未达标。" />);
  expect(screen.getByText(/运行有风险，需要确认/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "方式" })).toBeNull();
});

test("科研授权步骤、完整写入内容与验收可见，确认仍使用原请求身份", async () => {
  const onApproval = vi.fn();
  render(<ConversationLog research items={[]} toolCalls={[]} loading={false} streamStatus="idle" streamError={null}
    busyCommand={null} hasTask={false} showThinking={false} onCopy={vi.fn()} onFork={vi.fn()} onResend={vi.fn()} onApproval={onApproval}
    approvals={[{ requestId: "approval-1", kind: "confirm", title: "执行科研计划", message: '比较参数\n\n{"steps":[{"action":"write_file","path":"config.json","content":"完整配置"},{"action":"run_command","program":"node","args":["experiment.mjs"]}],"success_condition":{"kind":"metric","path":"report.json","key":"accuracy","operator":">=","value":0.93}}', impact: "命令使用本机权限执行", status: "pending" }]} />);
  expect(screen.getByText("完整配置")).toBeTruthy();
  expect(screen.getByText('node "experiment.mjs"')).toBeTruthy();
  expect(screen.getByText("report.json · accuracy >= 0.93")).toBeTruthy();
  expect(screen.getByText(/命令使用本机权限执行/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "允许一次" }));
  expect(onApproval).toHaveBeenCalledExactlyOnceWith("approval-1", "approve", undefined);
  cleanup();
  render(<ResearchApprovalPlan message={'未知操作\n\n{"steps":[{"action":"unknown_action","payload":"需要完整核对的原文"}]}'} />);
  expect(screen.getByText(/需要完整核对的原文/)).toBeTruthy();
});
