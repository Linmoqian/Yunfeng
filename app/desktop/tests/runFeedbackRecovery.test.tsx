/* 单订阅恢复验收：历史只恢复工具回执，快照收敛阶段，补发不重复正文或执行。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { TaskState, TaskStreamEvent } from "../src/services/taskService";
import { useTaskStream } from "../src/features/workbench/hooks/useTaskStream";
const api = vi.hoisted(() => ({ loadTask: vi.fn(), conversation: vi.fn(), interventions: vi.fn(), subscribe: vi.fn() }));
vi.mock("../src/services/taskService", () => ({ loadTask: api.loadTask, loadTaskConversation: api.conversation, loadSessionConversation: api.conversation, loadTaskInterventions: api.interventions, subscribeTaskEvents: api.subscribe }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
test("重连保留回执，恢复最新阶段且旧快照和旧文本不能覆盖实时进展", async () => {
  const task = { id: "task", sessionId: "session", mode: "research", lastEventSeq: 20, updatedAt: "2026-10-19T01:00:00Z", status: "running", autonomy: { phase: "EXECUTING" } } as TaskState;
  let receive!: (event: TaskStreamEvent) => void, connect!: (connected: boolean) => void;
  api.conversation.mockResolvedValue([]); api.interventions.mockResolvedValue([]);
  api.loadTask.mockResolvedValue({ ...task, lastEventSeq: 25, status: "waiting_input", autonomy: { phase: "PAUSED" } });
  api.subscribe.mockImplementation((_id, listener, connection) => { receive = listener; connect = connection; return vi.fn(); });
  const { result } = renderHook(() => useTaskStream({ task, sessionId: task.sessionId, isDraft: false, isLegacy: false, onTaskUpdated: vi.fn() }));
  await waitFor(() => expect(result.current.conversationLoading).toBe(false));
  act(() => {
    receive({ type: "message_delta", seq: 19, data: { delta: "旧文本" } });
    receive({ type: "tool_started", seq: 18, data: { callId: "call", name: "terminal", jobId: "job" } });
    receive({ type: "tool_finished", seq: 20, occurredAt: "2026-10-19T01:00:01Z", data: { callId: "call", name: "terminal", jobId: "job", elapsedMs: 100 } });
    receive({ type: "tool_finished", seq: 20, data: { callId: "call", name: "terminal", jobId: "job" } });
  });
  expect(result.current.toolCalls).toHaveLength(1); expect(result.current.toolCalls[0].elapsedMs).toBe(100);
  expect(result.current.conversation).toHaveLength(0);
  act(() => { connect(false); });
  expect(result.current.toolCalls).toHaveLength(1);
  act(() => { connect(true); });
  await waitFor(() => expect(result.current.activeTask?.autonomy?.phase).toBe("PAUSED"));
  act(() => { receive({ type: "task_updated", seq: 26, data: { ...task, lastEventSeq: 26, autonomy: { phase: "REFLECTING" } } }); });
  api.loadTask.mockResolvedValue({ ...task, lastEventSeq: 24 });
  act(() => { connect(true); });
  await waitFor(() => expect(api.loadTask).toHaveBeenCalledTimes(2));
  expect(result.current.activeTask?.autonomy?.phase).toBe("REFLECTING");
  expect(api.subscribe).toHaveBeenCalledTimes(1);
});
