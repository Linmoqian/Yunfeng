/* 状态租约与交互心跳的核心回归；未上报、过期和空闲均不能显示工作中。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemberStatus } from "../src/features/workbench/components/MemberStatus";
import { useTeamPresence } from "../src/features/workbench/hooks/useTeamPresence";
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
test("状态过期转离线，续报恢复，未上报保持未知，停用覆盖旧在线状态", async () => {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const p = { memberId: "a", status: "working" as const, observedAt: 100_000, expiresAt: 101_000 };
  const view = render(<MemberStatus enabled presence={p} />);
  expect(screen.getByText("工作中")).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(1001));
  expect(screen.getByText("离线")).toBeTruthy();
  view.rerender(<MemberStatus enabled presence={{ ...p, status: "online", expiresAt: 200_000 }} />);
  expect(screen.getByText("在线")).toBeTruthy();
  view.rerender(<MemberStatus enabled />);
  expect(screen.getByText("未知")).toBeTruthy();
  view.rerender(<MemberStatus enabled={false} presence={p} />);
  expect(screen.getByText("停用")).toBeTruthy();
});
test("交互上报在线、编辑与空闲，稳定状态限频，卸载后停止心跳", async () => {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const report = vi.fn().mockResolvedValue(true);
  const view = renderHook(() => useTeamPresence(true, report));
  await act(async () => {});
  expect(report).toHaveBeenLastCalledWith("online");
  await act(() => vi.advanceTimersByTimeAsync(2000));
  fireEvent.input(document);
  await act(async () => {});
  expect(report).toHaveBeenLastCalledWith("working");
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(report).toHaveBeenLastCalledWith("idle");
  expect(report.mock.calls.length).toBeLessThan(8);
  view.unmount(); const count = report.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(report).toHaveBeenCalledTimes(count);
});
