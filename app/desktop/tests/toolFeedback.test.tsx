/* 结构化回执回归：补发去重、乱序不回退、错误不折叠、技术输出不直出。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { reduceToolFeedback, settleToolFeedback } from "../src/features/workbench/toolFeedback";
import { ToolFeedback } from "../src/features/workbench/components/ToolFeedback";
import type { TaskStreamEvent } from "../src/services/taskService";
afterEach(cleanup);
const event = (type: string, seq: number, callId = "call", jobId = "job"): TaskStreamEvent => ({ type, seq, occurredAt: "2026-10-19T01:00:01Z", data: { callId, name: "read", jobId, startedAt: "2026-10-19T01:00:00Z", elapsedMs: 123 } });

test("结束事件先到或重复补发时不回退，更新不会覆盖输入，新作业清除旧回执", () => {
  let calls = reduceToolFeedback([], event("tool_finished", 2));
  expect(reduceToolFeedback(calls, event("tool_started", 1))).toBe(calls);
  expect(reduceToolFeedback(calls, event("tool_finished", 2))).toBe(calls);
  calls = reduceToolFeedback(calls, event("tool_started", 3, "second"));
  expect(calls).toHaveLength(2);
  calls = reduceToolFeedback(calls, { ...event("tool_updated", 4, "second"), data: { callId: "second", partialResult: "private-output" } });
  expect(calls[1].args).toBeUndefined(); expect(calls[1].result).toBe("private-output");
  calls = settleToolFeedback(calls, "2026-10-19T01:00:02Z");
  expect(calls[1].outcome).toBe("unknown");
  calls = reduceToolFeedback(calls, event("tool_started", 5, "next", "new-job"));
  expect(calls.map((call) => call.callId)).toEqual(["next"]);
});

test("工具成功不宣称实验通过，错误与取消可见，调用详情默认折叠且不显示输出", async () => {
  render(<ToolFeedback calls={[
    { callId: "a", name: "read", finishedAt: "now", elapsedMs: 123, outcome: "succeeded", result: "private-output" },
    { callId: "b", name: "modify", finishedAt: "now", outcome: "failed" },
    { callId: "c", name: "terminal", finishedAt: "now", outcome: "cancelled" },
    { callId: "d", name: "horizon", finishedAt: "now", outcome: "unknown" },
  ]} />);
  expect(screen.getByText("失败")).toBeTruthy(); expect(screen.getByText("已取消")).toBeTruthy();
  expect(screen.getByText("结果待核对")).toBeTruthy();
  expect(screen.queryByText(/验收通过/)).toBeNull(); expect(screen.queryByText("private-output")).toBeNull();
  expect(screen.queryByText("123 ms")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "调用记录" }));
  expect(screen.getByText("123 ms")).toBeTruthy();
});
