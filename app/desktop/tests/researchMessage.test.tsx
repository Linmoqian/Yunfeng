/* 科研分类展示核心回归：不丢指标、授权内容与原始未知步骤。
 * Created on 2026-10-19
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

test("基线结论突出结果与复核，配置原文只在详情展开，未知风险不被翻译掉", async () => {
  const body = '基线阶段已按约束完成：写入 .lin/experiments/config.json（stage=baseline, level=1）并运行 node benchmark.mjs，节点验收通过（baseline.json 存在）。实测结果：输入 68905 字节，level=1 压缩后 24426 字节，压缩比约 35.45%，roundtrip=true，解压字节与源码一致。当前 control.json 的 reviewApproved=false，按任务约束需暂停等待工程师复核，期间持续观察 control.json，不进入 optimize 阶段。';
  render(<ResearchMessage text={`实验结论：${body}`} />);
  expect(screen.getByText("基线已完成")).toBeTruthy();
  expect(screen.getByText("等待你复核，确认后继续。")).toBeTruthy();
  expect(screen.getByText("节点验收通过").getAttribute("data-tone")).toBe("success");
  expect(screen.queryByText(/control.json/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "详细过程" }));
  expect(screen.getByText(/reviewApproved=false/)).toBeTruthy();
  cleanup();
  render(<ResearchMessage text="实验结论：节点验收通过。当前 reviewApproved=false，等待人工复核，可能存在标签错误。" />);
  expect(screen.getByText(/可能存在标签错误/)).toBeTruthy();
});

test("公开文献查询的接收方、查询和报告路径在确认前直接可见", () => {
  const plan = { steps: [{ action: "read_horizon", domain: "literature", query: "public plant research", path: ".lin/experiments/literature.json" }], success_condition: { kind: "metric", path: ".lin/experiments/literature.json", key: "independent_candidates", operator: ">=", value: 2 } };
  render(<ResearchApprovalPlan message={`确认公开查询\n\n${JSON.stringify(plan)}`} />);
  expect(screen.getByText("文献检索 · Europe PMC / Crossref")).toBeTruthy();
  expect(screen.getByText("public plant research")).toBeTruthy();
  expect(screen.getByText(".lin/experiments/literature.json")).toBeTruthy();
});
