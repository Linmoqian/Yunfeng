/* 开发会话展示真实运行、思考增量和工具回执。
 * Created on 2026-10-28
 * @author: https://github.com/Linmoqian
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ConversationLog } from "../src/features/workbench/components/ConversationLog";

afterEach(cleanup);
test("运行提示随回复和工具状态变化，思考内容可展开", async () => {
  const common = { loading: false, running: true, streamStatus: "idle" as const, approvals: [], streamError: null, busyCommand: null, hasTask: true, showThinking: false, onCopy: vi.fn(), onFork: vi.fn(), onResend: vi.fn(), onApproval: vi.fn() };
  const view = render(<ConversationLog {...common} items={[{ id: "u", role: "user", text: "你好" }]} toolCalls={[]} />);
  expect(screen.getByText("思考中")).toBeTruthy();
  view.rerender(<ConversationLog {...common} items={[{ id: "a", role: "assistant", text: "", thinking: "先核对事实" }]} toolCalls={[]} />);
  await userEvent.click(screen.getByRole("button", { name: "查看思考内容" }));
  expect(screen.getByText("先核对事实")).toBeTruthy();
  view.rerender(<ConversationLog {...common} items={[{ id: "live", role: "assistant", text: "", thinking: "正在分析", streaming: true }]} toolCalls={[]} />);
  expect(screen.getByText("正在分析")).toBeTruthy();
  expect(screen.getByRole("button", { name: "从此分支" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "复制" })).toBeTruthy();
  view.rerender(<ConversationLog {...common} items={[]} toolCalls={[{ callId: "1", name: "read" }]} />);
  expect(screen.getByText("正在调用工具")).toBeTruthy();
  expect(screen.getByText("读取")).toBeTruthy();
  expect(screen.getByText("运行中")).toBeTruthy();
  view.rerender(<ConversationLog {...common} running={false} items={[]} toolCalls={[{ callId: "1", name: "read", finishedAt: "now", outcome: "succeeded" }]} />);
  expect(screen.queryByText("正在调用工具")).toBeNull();
  expect(screen.getByText("已完成")).toBeTruthy();
});
