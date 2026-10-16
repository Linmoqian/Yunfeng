/* 科研分支图的真实快照更新与按需详情；布局逻辑另由核心测试验证。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchGraph } from "../src/features/workbench/components/ResearchGraph";
import type { TaskState } from "../src/services/taskService";
vi.mock("../src/features/workbench/hooks/useResearchGraphComponent", () => ({ useResearchGraphComponent: () => ({ root: { current: null }, agentTarget: null, yieldControl: vi.fn() }) }));
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, nodeTypes }: any) => <div>{nodes.map((node: any) => { const View = nodeTypes[node.type]; return <View key={node.id} data={node.data} />; })}</div>,
  useViewport: () => ({ zoom: 1 }),
  NodeToolbar: ({ isVisible, children }: any) => isVisible ? children : null,
  Handle: () => null, Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" }, MarkerType: { ArrowClosed: "arrow" },
}));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
test("节点周围按需展开真实胶囊，重复点击收起，切换快照不串实验", async () => {
  const task = { id: "research", mode: "research", autonomy: { decision: { mission: { id: "mission", objective: "研究目标" },
    nodes: [{ id: "exp", parent: "mission", objective: "训练实验", kind: "execute", status: "running", priority: 0.8, confidence: 0.9, cost: 1, expected_gain: 0.7, attempts: 1 }], horizon: [], selectedId: "exp" } } } as unknown as TaskState;
  const close = vi.fn();
  const view = render(<ResearchGraph task={task} onClose={close} />);
  expect(screen.queryByLabelText("节点概览")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "训练实验 · 进行中" }));
  expect(screen.getByLabelText("节点概览").textContent).toContain("进行中");
  const next = structuredClone(task);
  next.autonomy!.decision!.nodes[0].status = "succeeded";
  const node = next.autonomy!.decision!.nodes[0];
  node.jobId = "job-exp";
  node.report = { component: "research", revision: 2, state: { jobId: "job-exp", source: "metrics.json", updatedAt: "", metrics: [{ label: "准确率", value: 0.93 }], conclusion: { summary: "实验达到目标", details: "折叠的实验过程" } }, result: { job_id: "job-exp", status: "succeeded", evaluation: { passed: true, reason: "真实验收" } } };
  next.autonomy!.component = { ...node.report, state: { ...node.report.state, jobId: "other", metrics: [{ label: "错误实验", value: 99 }] } };
  view.rerender(<ResearchGraph task={next} onClose={close} />);
  expect(screen.getByLabelText("节点概览").textContent).toContain("验收通过");
  expect(screen.getByLabelText("节点实验信息").textContent).toContain("准确率 0.93");
  expect(screen.getByLabelText("节点实验信息").textContent).toContain("实验达到目标");
  expect(screen.queryByText("折叠的实验过程")).toBeNull();
  expect(screen.getByLabelText("节点实验信息").textContent).not.toContain("错误实验");
  await userEvent.click(screen.getByRole("button", { name: "训练实验 · 验收通过" }));
  await waitFor(() => {
    expect(screen.queryByLabelText("节点概览")).toBeNull();
    expect(screen.queryByLabelText("节点实验信息")).toBeNull();
  });
  await userEvent.click(screen.getByRole("button", { name: "返回对话" }));
  expect(close).toHaveBeenCalledOnce();
  view.rerender(<ResearchGraph task={{ ...task, autonomy: undefined }} onClose={close} />);
  expect(screen.getByText(/目标树尚未生成/)).toBeTruthy();
});

test("相关性按需打开，区分余弦值和语义建议，点击目标切换节点", async () => {
  const task = { id: "research", lastEventSeq: 4, autonomy: { decision: { mission: { id: "mission", objective: "研究目标" },
    nodes: [{ id: "exp", parent: "mission", objective: "训练实验", kind: "execute", status: "pending", relevance: { status: "ready", source: "hash", matches: [
      { target: "mission", similarity: 0.76, relation: "abstraction", direction: "outgoing", confidence: 0.8, reason: "训练服务于整体研究目标" },
    ] } }], horizon: [] } } } as unknown as TaskState;
  render(<ResearchGraph task={task} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "训练实验 · 待执行" }));
  expect(screen.queryByText("关系建议 · 非实测因果")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "节点相关性" }));
  expect(await screen.findByText("关系建议 · 非实测因果")).toBeTruthy();
  expect(screen.getByText("0.76").title).toContain("不是正确率");
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "节点相关性" }).getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "节点相关性" }));
  await userEvent.click(screen.getByRole("button", { name: "节点相关性" }));
  await userEvent.click(screen.getByRole("button", { name: /抽象 → 研究目标/ }));
  await waitFor(() => expect(screen.getByLabelText("节点概览").textContent).toContain("研究目标"));
});
