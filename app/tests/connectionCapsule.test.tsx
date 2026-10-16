/* 重连胶囊过滤短暂断连并在稳定恢复后收起；真实错误保留入口。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectionCapsule } from "../src/features/workbench/components/ConnectionCapsule";
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
