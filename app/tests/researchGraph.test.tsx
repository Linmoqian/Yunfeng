/* 科研分支图的真实快照更新与按需详情；布局逻辑另由核心测试验证。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchGraph } from "../src/features/workbench/components/ResearchGraph";
import type { TaskState } from "../src/services/taskService";
vi.mock("../src/features/workbench/hooks/useResearchGraphComponent", () => ({ useResearchGraphComponent: () => ({ root: { current: null }, agentTarget: null, yieldControl: vi.fn() }) }));
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, nodeTypes }: any) => <div>{nodes.map((node: any) => { const View = nodeTypes[node.type]; return <View key={node.id} data={node.data} />; })}</div>,
  Handle: () => null, Position: { Left: "left", Right: "right" }, MarkerType: { ArrowClosed: "arrow" },
}));
afterEach(cleanup);
test("节点详情来自最新快照，返回对话可操作，空树如实提示", async () => {
  const task = { id: "research", mode: "research", autonomy: { decision: { mission: { id: "mission", objective: "研究目标" },
    nodes: [{ id: "exp", parent: "mission", objective: "训练实验", kind: "execute", status: "running", priority: 0.8, confidence: 0.9, cost: 1, expected_gain: 0.7, attempts: 1 }], horizon: [], selectedId: "exp" } } } as unknown as TaskState;
  const close = vi.fn();
  const view = render(<ResearchGraph task={task} onClose={close} />);
  expect(screen.queryByLabelText("节点详情")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "训练实验 · 进行中" }));
  expect(screen.getByLabelText("节点详情").textContent).toContain("尚无该实验的指标报告");
  const next = structuredClone(task);
  next.autonomy!.decision!.nodes[0].status = "succeeded";
  const node = next.autonomy!.decision!.nodes[0];
  node.jobId = "job-exp";
  node.report = { component: "research", revision: 2, state: { jobId: "job-exp", source: "metrics.json", updatedAt: "", metrics: [{ label: "准确率", value: 0.93 }], conclusion: { summary: "实验达到目标", details: "折叠的实验过程" } }, result: { job_id: "job-exp", status: "succeeded", evaluation: { passed: true, reason: "真实验收" } } };
  next.autonomy!.component = { ...node.report, state: { ...node.report.state, jobId: "other", metrics: [{ label: "错误实验", value: 99 }] } };
  view.rerender(<ResearchGraph task={next} onClose={close} />);
  expect(screen.getByLabelText("节点详情").textContent).toContain("验收通过");
  expect(screen.getByLabelText("节点详情").textContent).toContain("准确率 0.93");
  expect(screen.getByLabelText("节点详情").textContent).toContain("实验达到目标");
  expect(screen.queryByText("折叠的实验过程")).toBeNull();
  expect(screen.getByLabelText("节点详情").textContent).not.toContain("错误实验");
  await userEvent.click(screen.getByRole("button", { name: "返回对话" }));
  expect(close).toHaveBeenCalledOnce();
  view.rerender(<ResearchGraph task={{ ...task, autonomy: undefined }} onClose={close} />);
  expect(screen.getByText(/目标树尚未生成/)).toBeTruthy();
});
