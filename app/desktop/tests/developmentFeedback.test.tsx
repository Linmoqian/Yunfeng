/* 开发会话展示真实运行、思考增量和工具回执。
 * Created on 2026-10-28
 * @author: https://github.com/Linmoqian
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ConversationLog } from "../src/features/workbench/components/ConversationLog";

afterEach(cleanup);
test("已发送消息不显示送达标签，流式加粗未闭合时保持正常排版", () => {
  const common = { loading: false, running: true, streamStatus: "streaming" as const, approvals: [], streamError: null, busyCommand: null, hasTask: true, showThinking: false, onCopy: vi.fn(), onFork: vi.fn(), onResend: vi.fn(), onApproval: vi.fn() };
  const view = render(<ConversationLog {...common} toolCalls={[]} items={[
    { id: "u", role: "user", text: "你是谁", status: "sent" },
    { id: "a", role: "assistant", text: "我能做的事：\n\n- **编码", streaming: true },
  ]} />);
  expect(screen.queryByText("已发送")).toBeNull();
  expect(screen.getByText("编码").tagName).toBe("STRONG");
  view.rerender(<ConversationLog {...common} toolCalls={[]} items={[{ id: "a", role: "assistant", text: "我能做的事：\n\n- **编码相关**：编写代码", streaming: true }]} />);
  expect(screen.getByText("编码相关").tagName).toBe("STRONG");
  view.rerender(<ConversationLog {...common} toolCalls={[]} items={[{ id: "u", role: "user", text: "测试", status: "failed" }]} />);
  expect(screen.getByText("发送失败")).toBeTruthy();
  expect(screen.getByRole("button", { name: /重新发送/ })).toBeTruthy();
});

test("运行提示随回复和工具状态变化，思考内容可展开", async () => {
  const common = { loading: false, running: true, streamStatus: "idle" as const, approvals: [], streamError: null, busyCommand: null, hasTask: true, showThinking: false, onCopy: vi.fn(), onFork: vi.fn(), onResend: vi.fn(), onApproval: vi.fn() };
  const view = render(<ConversationLog {...common} items={[{ id: "u", role: "user", text: "你好" }]} toolCalls={[]} />);
  const thinkingButton = screen.getByRole("button", { name: "思考中" });
  expect(thinkingButton.getAttribute("aria-expanded")).toBe("false");
  await userEvent.click(thinkingButton);
  expect(screen.getByText("暂未收到思考内容。")).toBeTruthy();
  view.rerender(<ConversationLog {...common} items={[{ id: "a", role: "assistant", text: "", thinking: "先核对事实" }]} toolCalls={[]} />);
  await userEvent.click(screen.getByRole("button", { name: "查看思考内容" }));
  expect(screen.getByText("先核对事实")).toBeTruthy();
  view.rerender(<ConversationLog {...common} items={[{ id: "live", role: "assistant", text: "", thinking: "正在分析", streaming: true }]} toolCalls={[]} />);
  expect(screen.getByText("正在分析")).toBeTruthy();
  view.rerender(<ConversationLog {...common} items={[{ id: "live", role: "assistant", text: "", thinking: "正在分析并核对", streaming: true }]} toolCalls={[]} />);
  expect(screen.getByText("正在分析并核对")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "思考中" }));
  expect(screen.getByRole("button", { name: "思考中" }).getAttribute("aria-expanded")).toBe("false");
  view.rerender(<ConversationLog {...common} items={[{ id: "live", role: "assistant", text: "回答", thinking: "正在分析并核对", streaming: true }]} toolCalls={[]} />);
  expect(screen.getByText("正在回复")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "查看思考内容" }));
  expect(screen.getByText("正在分析并核对")).toBeTruthy();
  view.rerender(<ConversationLog {...common} items={[]} toolCalls={[{ callId: "1", name: "read" }]} />);
  expect(screen.getByText("正在调用工具")).toBeTruthy();
  expect(screen.getByText("读取")).toBeTruthy();
  expect(screen.getByText("运行中")).toBeTruthy();
  view.rerender(<ConversationLog {...common} running={false} items={[]} toolCalls={[{ callId: "1", name: "read", finishedAt: "now", outcome: "succeeded" }]} />);
  expect(screen.queryByText("正在调用工具")).toBeNull();
  expect(screen.getByText("已完成")).toBeTruthy();
});
