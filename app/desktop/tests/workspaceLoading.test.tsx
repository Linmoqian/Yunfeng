/* 多处加载只呈现一个胶囊；断连恢复不清空已有消息。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceLoadingProvider, WorkspaceLoadingIndicator } from "../src/features/workbench/components/WorkspaceLoading";
import { ConversationLoading } from "../src/features/workbench/components/ConversationLoading";
import { NavigationLoadState } from "../src/features/workbench/components/NavigationLoadState";
import { useTaskStream } from "../src/features/workbench/hooks/useTaskStream";
import * as api from "../src/services/taskService";
vi.mock("../src/features/workbench/components/ConnectionCapsule", () => ({ ConnectionCapsule: ({ busy }: { busy: boolean }) => busy ? <span role="status">加载</span> : null }));
vi.mock("../src/services/taskService", () => ({ loadTaskConversation: vi.fn(), loadTaskInterventions: vi.fn().mockResolvedValue([]), subscribeTaskEvents: vi.fn() }));
afterEach(cleanup);
it("侧边栏和会话同时加载只有一个状态，结束后移除且保留内容和输入", () => {
  function Page({ busy }: { busy: boolean }) {
    return <WorkspaceLoadingProvider><WorkspaceLoadingIndicator busy={false} error={null} onRetry={() => {}} />
      <NavigationLoadState loading={busy} hasItems /><p>已有内容</p><input aria-label="草稿" defaultValue="继续实验" />
      {busy && <><ConversationLoading /><ConversationLoading /></>}
    </WorkspaceLoadingProvider>;
  }
  const page = render(<Page busy />); const draft = screen.getByRole("textbox");
  expect(screen.getAllByRole("status")).toHaveLength(1);
  page.rerender(<Page busy={false} />);
  expect(screen.queryByRole("status")).toBeNull(); expect(screen.getByText("已有内容")).toBeTruthy();
  expect(screen.getByRole("textbox")).toBe(draft); expect((draft as HTMLInputElement).value).toBe("继续实验");
});
it("SSE 断线与重连补读期间保留消息，恢复后按身份合并", async () => {
  let connection!: (connected: boolean) => void;
  const stop = vi.fn();
  vi.mocked(api.subscribeTaskEvents).mockImplementation((_task, _event, listener) => { connection = listener!; return stop; });
  vi.mocked(api.loadTaskConversation).mockResolvedValue([{ id: "message", role: "assistant", content: [{ type: "text", text: "已有结论" }] }]);
  const task = { id: "task", sessionId: "session", status: "waiting_input" } as api.TaskState;
  const hook = renderHook(() => useTaskStream({ task, sessionId: "session", isDraft: false, isLegacy: false, onTaskUpdated: () => {} }));
  await waitFor(() => expect(hook.result.current.conversation).toHaveLength(1));
  const original = hook.result.current.conversation[0];
  act(() => connection(false)); expect(hook.result.current.conversation[0]).toBe(original);
  let resolve!: (messages: unknown[]) => void;
  vi.mocked(api.loadTaskConversation).mockImplementation(() => new Promise((done) => { resolve = done; }));
  act(() => connection(true)); expect(hook.result.current.conversation[0]).toBe(original);
  await act(async () => resolve([{ id: "message", role: "assistant", content: [{ type: "text", text: "已有结论" }] }]));
  expect(hook.result.current.conversation).toHaveLength(1);
  hook.unmount(); expect(stop).toHaveBeenCalledOnce();
});
