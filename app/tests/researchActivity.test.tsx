/* 科研工作反馈回归：计时不随快照重置，空闲与授权不伪装执行，节点来自真实快照。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ResearchActivity, ResearchResponseClock } from "../src/features/workbench/components/ResearchActivity";
import type { TaskState } from "../src/services/taskService";
vi.mock("../src/components/common", () => ({
  Capsule: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Details: ({ children }: { children: React.ReactNode }) => <details>{children}</details>,
  MapleCloudLoading: () => <span data-testid="work-animation" />,
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });
const start = "2026-10-18T10:00:00.000Z";
function task(): TaskState {
  return { id: "research", mode: "research", createdAt: start, updatedAt: start, autonomy: {
    phase: "PLANNING", cycle: 1, reason: "更新目标树", trigger: { receivedAt: start, signals: [] },
    decision: { selectedId: "cnn", mission: { id: "mission", objective: "实现网络" }, nodes: [{ id: "cnn", presentation: { title: "编写 CNN", summary: "实现卷积与前向传播。" } }] },
  } } as unknown as TaskState;
}
test("活跃响应持续计时，快照刷新不重置，待授权后停止计时与动画", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(start));
  const value = task();
  const view = render(<ResearchActivity task={value} />);
  expect(screen.getByText("编写 CNN")).toBeTruthy();
  expect(screen.getByTestId("work-animation")).toBeTruthy();
  act(() => { vi.advanceTimersByTime(3000); });
  expect(screen.getByText("00:03")).toBeTruthy();
  const next = { ...value, updatedAt: "2026-10-18T10:00:02.000Z" };
  view.rerender(<ResearchActivity task={next} />);
  expect(screen.getByText("00:03")).toBeTruthy();
  view.rerender(<ResearchActivity task={{ ...next, autonomy: { ...next.autonomy!, phase: "WAITING", approvalId: "approval" } }} />);
  act(() => { vi.advanceTimersByTime(5000); });
  expect(screen.getByText("00:02")).toBeTruthy();
  expect(screen.queryByTestId("work-animation")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("确认");
});
test("空闲等待无工作动画，真实作业运行继续提示，完成后保留静态时间", () => {
  const value = task();
  const view = render(<ResearchActivity task={{ ...value, autonomy: { ...value.autonomy!, phase: "WAITING" } }} />);
  expect(screen.queryByTestId("work-animation")).toBeNull();
  view.rerender(<ResearchActivity task={{ ...value, autonomy: { ...value.autonomy!, phase: "WAITING", jobId: "job" } }} />);
  expect(screen.getByTestId("work-animation")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("实验正在运行");
  view.rerender(<ResearchActivity task={{ ...value, autonomy: { ...value.autonomy!, phase: "COMPLETED" } }} />);
  expect(screen.queryByLabelText("科研工作进展")).toBeNull();
  view.rerender(<ResearchResponseClock task={{ ...value, updatedAt: "2026-10-18T10:01:15.000Z" }} working={false} />);
  expect(screen.getByText("01:15")).toBeTruthy();
});

test("验收直接来自结果字段，暂停原因可见且不播放工作动画", () => {
  const value = task();
  const view = render(<ResearchActivity task={{ ...value, autonomy: { ...value.autonomy!, phase: "REFLECTING", result: { job_id: "job", status: "succeeded", evaluation: { passed: false, reason: "指标未达到阈值" } } } }} />);
  expect(screen.getByText("节点验收未通过")).toBeTruthy();
  expect(screen.queryByText("节点验收通过")).toBeNull();
  view.rerender(<ResearchActivity task={{ ...value, autonomy: { ...value.autonomy!, phase: "PAUSED", reason: "需要你补充独立验证数据" } }} />);
  expect(screen.getByRole("note").textContent).toContain("补充独立验证数据");
  expect(screen.queryByTestId("work-animation")).toBeNull();
});
