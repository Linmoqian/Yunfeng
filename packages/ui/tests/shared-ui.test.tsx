/* 验证跨宿主事实更新、详情保留及移动端重连恢复，不调用真实网络。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { Capsule, ProgressCapsule } from "../src";
import { Details } from "../src/Details";
import { ConnectionBanner } from "../../../app/mobile/src/components/ConnectionBanner";

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion"), media: query,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

test("同一胶囊立即更新真实状态，详情保持展开，非法进度不伪造比例", () => {
  const content = (value: number) => <>
    <Capsule status={value === 1 ? "running" : "completed"} value={value} animateOnMount={false}>阶段 {value}</Capsule>
    <ProgressCapsule label="实验" current={value} total={2} />
    <Details label="实验过程"><p>过程 {value}</p></Details>
  </>;
  const view = render(content(1));
  const capsule = screen.getByText("阶段 1");
  fireEvent.click(screen.getByRole("button", { name: "实验过程" }));
  view.rerender(content(2));
  expect(screen.getByText("阶段 2")).toBe(capsule);
  expect(capsule.dataset.status).toBe("completed");
  expect(screen.getByRole("button", { name: "实验过程" }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("progressbar", { name: "实验" }).getAttribute("aria-valuenow")).toBe("2");
  view.rerender(<ProgressCapsule label="实验" current={3} total={2} />);
  expect(screen.queryByRole("progressbar")).toBeNull();
});

test("移动宿主复用稳定胶囊，快速恢复不闪现，重试与恢复后收起有效", async () => {
  vi.useFakeTimers(); const retry = vi.fn();
  const view = render(<ConnectionBanner online onRetry={retry} />);
  view.rerender(<ConnectionBanner online={false} onRetry={retry} />);
  await act(() => vi.advanceTimersByTimeAsync(300));
  view.rerender(<ConnectionBanner online onRetry={retry} />);
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(screen.queryByRole("status")).toBeNull();
  view.rerender(<ConnectionBanner online={false} onRetry={retry} />);
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(screen.getByRole("status").textContent).toContain("正在重新连接");
  fireEvent.click(screen.getByRole("button", { name: "立即重试" }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(<ConnectionBanner online onRetry={retry} />);
  expect(screen.getByText("连接已恢复")).toBeDefined();
  await act(() => vi.advanceTimersByTimeAsync(1200));
  expect(screen.queryByRole("status")).toBeNull();
});
