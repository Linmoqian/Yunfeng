/* 服务端排队消息的核心回归：清空失败保留消息，事件刷新后以服务端结果为准。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueuedMessages } from "../src/features/workbench/components/QueuedMessages";
import { ProgressCapsule } from "../src/features/workbench/components/ProgressCapsule";
import { sendTaskCommand } from "../src/services/taskService";

vi.mock("../src/services/taskService", () => ({ sendTaskCommand: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

test("队列读取服务端内容，清空失败保留消息，成功后重新核对", async () => {
  let cleared = false, fail = true;
  vi.mocked(sendTaskCommand).mockImplementation(async (_id, command) => {
    if (command.type === "clearQueue") { if (fail) throw new Error("失败"); cleared = true; return null; }
    return { steering: [], followUp: cleared ? [] : ["核对实验数据"] };
  });
  render(<QueuedMessages taskId="task-queue" revision="1" />);
  expect(await screen.findByText("核对实验数据")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "清空所有排队消息" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText("核对实验数据")).toBeTruthy();
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "清空所有排队消息" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "等待处理的消息" })).toBeNull());
  expect(sendTaskCommand).toHaveBeenCalledWith("task-queue", { type: "clearQueue" });
});

test("有明确总量才显示进度刻度，未知总量只显示当前计数", () => {
  const { rerender } = render(<ProgressCapsule label="任务节点" current={2} total={5} />);
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  expect(screen.getByRole("progressbar").getAttribute("aria-valuemax")).toBe("5");
  rerender(<ProgressCapsule label="文稿" current={1200} unit="字符" />);
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.getByText("1,200 字符")).toBeTruthy();
  rerender(<ProgressCapsule label="训练" current={Number.NaN} total={10} />);
  expect(screen.queryByText("训练")).toBeNull();
});
