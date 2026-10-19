/* 科研样例只验证事件边界、暂停检查点、自动推进和节点查看，不接触业务服务。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ResearchLoopSample } from "../src/routes/ui-library/ResearchLoopSample";
import { initialResearchSample, researchSampleReducer as reduce } from "../src/routes/ui-library/researchSampleState";
afterEach(() => { cleanup(); vi.useRealTimers(); });

test("暂停保留执行进度，两个 Hook 分别驱动基线与优化，完成后拒绝再次唤醒", () => {
  let state = initialResearchSample;
  expect(reduce(state, { type: "next" })).toBe(state);
  state = reduce(state, { type: "hook" });
  state = reduce(state, { type: "next" }); state = reduce(state, { type: "next" });
  state = reduce(state, { type: "next" });
  expect(state.phase).toBe("execute"); expect(state.progress).toBe(1);
  state = reduce(state, { type: "pause" });
  expect(reduce(state, { type: "next" })).toBe(state);
  expect(reduce(state, { type: "hook" })).toBe(state);
  state = reduce(state, { type: "resume" }); state = reduce(state, { type: "next" });
  expect(state.finished).toBe(1); expect(state.phase).toBe("reflect");
  state = reduce(state, { type: "next" });
  expect(state.phase).toBe("waiting"); expect(state.hooks).toBe(1);
  expect(reduce(state, { type: "next" })).toBe(state);
  state = reduce(state, { type: "hook" });
  for (let i = 0; i < 5; i++) state = reduce(state, { type: "next" });
  expect(state.phase).toBe("complete"); expect(state.finished).toBe(2); expect(state.hooks).toBe(2);
  expect(reduce(state, { type: "hook" })).toBe(state);
  expect(reduce(state, { type: "reset" })).toBe(initialResearchSample);
});

test("自动推进遇暂停与等待即停，查看其他节点不改变运行节点，重置清理计时器", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  render(<ResearchLoopSample />);
  fireEvent.click(screen.getByRole("button", { name: "自动推进" }));
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(screen.getByText("等待 Hook")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Hook 唤醒" }));
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(screen.getByText("决策")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "查看优化与验证" }));
  expect(screen.getByRole("button", { name: "查看优化与验证" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "暂停", exact: true }));
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(screen.getByText("已暂停")).toBeTruthy();
  expect(screen.getByText("已保留决策阶段，继续后从原处推进。")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "继续", exact: true }));
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(screen.getByText("执行")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "重置科研演示" }));
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(screen.getByText("等待 Hook")).toBeTruthy();
  expect(screen.getByRole("button", { name: "自动推进" }).getAttribute("aria-pressed")).toBe("false");
});
