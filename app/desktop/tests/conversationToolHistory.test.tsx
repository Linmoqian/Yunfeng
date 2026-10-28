/* 会话恢复工具调用、结果和实时回执，不重复显示或推断结果。
 * Created on 2026-10-28
 * @author: https://github.com/Linmoqian
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ConversationLog, normalizeConversationMessages } from "../src/features/workbench/components/ConversationLog";

afterEach(cleanup);
test("从历史消息恢复调用顺序、参数、失败结果，并与实时回执去重", async () => {
  const items = normalizeConversationMessages([
    { id: "u", role: "user", content: [{ type: "text", text: "开始" }] },
    { id: "a", role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "echo test" } }] },
    { id: "r", role: "toolResult", toolCallId: "call-1", content: [{ type: "text", text: "超时" }], isError: true, durationMs: 1200 },
    { id: "b", role: "assistant", content: [{ type: "text", text: "执行结束" }] },
    { id: "c", role: "assistant", content: [{ type: "toolCall", id: "call-2", name: "read", arguments: { path: "a.txt" } }] },
  ]);
  expect(items.map((item) => item.id)).toEqual(["u", "a", "b", "c"]);
  expect(items[1].toolCalls?.[0]).toMatchObject({ outcome: "failed", elapsedMs: 1200, result: "超时" });
  expect(items[3].toolCalls?.[0].outcome).toBe("unknown");
  render(<ConversationLog items={items} toolCalls={[{ callId: "call-1", name: "bash" }]} loading={false} running={false} streamStatus="idle" approvals={[]} streamError={null} busyCommand={null} hasTask showThinking={false} onCopy={vi.fn()} onFork={vi.fn()} onResend={vi.fn()} onApproval={vi.fn()} />);
  const log = screen.getByRole("log");
  expect(within(log).getAllByRole("region", { name: "工具调用反馈" })).toHaveLength(2);
  expect(log.textContent?.indexOf("终端")).toBeLessThan(log.textContent?.indexOf("执行结束") ?? 0);
  expect(screen.getByText("结果待核对")).toBeTruthy();
  expect(screen.queryByText("超时")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /终端.*失败/ }));
  expect(screen.getByText("超时")).toBeTruthy();
  expect(screen.getByText(/echo test/)).toBeTruthy();
});
