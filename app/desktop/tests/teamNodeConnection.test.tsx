/* 独立节点断线保留、自动恢复及请求背压，防止刷新覆盖编辑草稿。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useTeamWorkspace } from "../src/features/workbench/hooks/useTeamWorkspace";
import { collaborationAction } from "../src/features/workbench/services/collaborationService";
import type { CollaborationSnapshot } from "../src/features/workbench/services/collaborationService";
vi.mock("../src/features/workbench/services/collaborationService", () => ({ collaborationAction: vi.fn(), collaborationError: () => "调用失败" }));
vi.mock("../src/components/titlebar/windowPlatform", () => ({ getRuntimeWindowPlatform: () => "macos" }));
const snapshot: CollaborationSnapshot = {
  installationId: "node", mode: "local", team: { id: "team", name: "测试组", owner: "", members: [] }, savedTeams: [],
  messages: [{ id: "message", name: "实验程序", text: "结果已保存", createdAt: 1 }], board: "复核实验", links: [], networkAvailable: true,
  connection: { id: "node", name: "节点", address: "http://127.0.0.1:19001", peerFailures: 0 },
  participants: [{ id: "node", nodeId: "node", profile: { name: "程序", kind: "program", access: "editor", summary: "", enabled: true, assistant: null, robot: null, robotControl: false } }],
  relations: [], presence: [{ memberId: "node", status: "working", observedAt: 100_000, expiresAt: 190_000 }],
};
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

test("节点中断保留内容且静默重试，恢复后自动更新，隐藏页面停止刷新", async () => {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  const call = vi.mocked(collaborationAction);
  call.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ...snapshot, presence: [{ ...snapshot.presence![0], status: "idle" }] });
  const view = renderHook(({ active }) => useTeamWorkspace(active), { initialProps: { active: true } });
  await act(async () => {});
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(view.result.current.connectionLost).toBe(true);
  expect(view.result.current.messages).toEqual(snapshot.messages);
  expect(view.result.current.notice).toBe("");
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(view.result.current.connectionLost).toBe(false);
  expect(view.result.current.presence[0].status).toBe("idle");
  view.rerender({ active: false }); const count = call.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(call).toHaveBeenCalledTimes(count);
});

test("刷新串行，前台断开等待刷新完成，旧节点结果不能覆盖本地团队", async () => {
  vi.useFakeTimers();
  let resolve!: (snapshot: CollaborationSnapshot) => void;
  const pending = new Promise<CollaborationSnapshot>((done) => { resolve = done; });
  const local = { ...snapshot, connection: undefined, team: { ...snapshot.team!, id: "local" } };
  const call = vi.mocked(collaborationAction).mockResolvedValueOnce(snapshot).mockReturnValueOnce(pending).mockResolvedValue(local);
  const view = renderHook(() => useTeamWorkspace(true)); await act(async () => {});
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(call).toHaveBeenCalledTimes(2);
  let disconnected!: Promise<boolean>;
  act(() => { disconnected = view.result.current.disconnect(); });
  expect(call).toHaveBeenCalledTimes(2);
  await act(async () => { resolve(snapshot); await disconnected; });
  expect(call).toHaveBeenLastCalledWith({ action: "nodeDisconnect" });
  expect(view.result.current.team?.id).toBe("local");
  expect(view.result.current.connection).toBeUndefined();
});

test("重启时节点不可达也继续恢复，首次可达后直接读取原节点快照", async () => {
  vi.useFakeTimers();
  const call = vi.mocked(collaborationAction).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(snapshot);
  const view = renderHook(() => useTeamWorkspace(true));
  await act(async () => {});
  expect(view.result.current.connectionLost).toBe(true);
  expect(view.result.current.snapshot).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(call).toHaveBeenLastCalledWith({ action: "nodeRefresh" });
  expect(view.result.current.connection?.id).toBe("node");
  expect(view.result.current.notice).toBe("");
});
