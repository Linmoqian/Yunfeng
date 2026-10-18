/* 重连胶囊过滤短暂断连并在稳定恢复后收起；真实错误保留入口。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectionCapsule } from "../src/features/workbench/components/ConnectionCapsule";
import { ConnectionSample } from "../src/routes/ui-library/ConnectionSample";
vi.mock("../src/features/workbench/components/MapleCloudLoading", () => ({ MapleCloudLoading: () => <span /> }));
vi.mock("motion/react", async () => {
  const React = await import("react");
  return { useReducedMotion: () => true, AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: Record<string, unknown>) => React.createElement("div", props, children as React.ReactNode) } };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("短暂断连不闪现，重复重试保持胶囊，恢复稳定后自动收起", async () => {
  vi.useFakeTimers(); const onRetry = vi.fn();
  const view = render(<ConnectionCapsule busy onRetry={onRetry} />);
  await act(() => vi.advanceTimersByTimeAsync(300));
  view.rerender(<ConnectionCapsule busy={false} onRetry={onRetry} />);
  await act(() => vi.advanceTimersByTimeAsync(800)); expect(screen.queryByRole("status")).toBeNull();
  view.rerender(<ConnectionCapsule busy onRetry={onRetry} />);
  await act(() => vi.advanceTimersByTimeAsync(600)); const capsule = screen.getByRole("status");
  view.rerender(<ConnectionCapsule busy onRetry={onRetry} />); expect(screen.getByRole("status")).toBe(capsule);
  view.rerender(<ConnectionCapsule busy={false} onRetry={onRetry} />);
  await act(() => vi.advanceTimersByTimeAsync(200)); expect(screen.getByRole("status")).toBe(capsule);
  view.rerender(<ConnectionCapsule busy onRetry={onRetry} />);
  await act(() => vi.advanceTimersByTimeAsync(800)); expect(screen.getByRole("status")).toBe(capsule);
  view.rerender(<ConnectionCapsule busy={false} onRetry={onRetry} />);
  await act(() => vi.advanceTimersByTimeAsync(1300)); expect(screen.queryByRole("status")).toBeNull();
});
it("真实错误立即提供详情入口，退出清理显示计时器", () => {
  vi.useFakeTimers(); const view = render(<ConnectionCapsule busy error="HTTP 403" onRetry={() => {}} />);
  expect(screen.getByRole("button", { name: "查看连接异常" })).toBeTruthy();
  view.unmount(); expect(vi.getTimerCount()).toBe(0);
});

it("演示自动恢复并收起，再次断线与卸载会清理旧的恢复任务", async () => {
  vi.useFakeTimers(); const view = render(<ConnectionSample />);
  fireEvent.click(screen.getByRole("button", { name: "模拟断线" }));
  expect(screen.getByRole("button", { name: "查看连接异常" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "重连", exact: true }));
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(screen.getByText("正在自动重连")).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(4400));
  expect(screen.getByText(/连接正常/)).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(screen.queryByText("正在自动重连")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "重连", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "模拟断线" }));
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(screen.getByRole("button", { name: "查看连接异常" })).toBeTruthy();
  view.unmount(); expect(vi.getTimerCount()).toBe(0);
});
