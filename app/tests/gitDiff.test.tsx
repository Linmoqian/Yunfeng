/* 差异请求的取消隔离与失败恢复，防止快速切换后呈现旧代码。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GitDiff } from "../src/features/workbench/components/GitDiff";
import { loadTaskGitDiff } from "../src/services/taskService";

vi.mock("../src/services/taskService", () => ({ loadTaskGitDiff: vi.fn() }));
const computedStyle = window.getComputedStyle;
beforeEach(() => { vi.spyOn(window, "getComputedStyle").mockImplementation((element) => computedStyle(element)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });
const props = { taskId: "task", onClose: vi.fn(), afterClose: vi.fn() };

test("切换文件取消旧请求，迟到响应不覆盖当前差异，关闭也取消", async () => {
  let finish!: (value: { supported: boolean; patch: string }) => void;
  vi.mocked(loadTaskGitDiff).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  vi.mocked(loadTaskGitDiff).mockResolvedValue({ supported: true, patch: "+current" });
  const view = render(<GitDiff {...props} filePath="/project/old.ts" />);
  const oldSignal = vi.mocked(loadTaskGitDiff).mock.calls[0][2]!;
  view.rerender(<GitDiff {...props} filePath="/project/current.ts" />);
  expect(oldSignal.aborted).toBe(true);
  expect(await screen.findByText("+current")).toBeTruthy();
  finish({ supported: true, patch: "+stale" });
  await waitFor(() => expect(screen.queryByText("+stale")).toBeNull());
  view.rerender(<GitDiff {...props} filePath={null} />);
  expect(vi.mocked(loadTaskGitDiff).mock.calls[1][2]!.aborted).toBe(true);
});

test("读取失败可重试，不支持文本预览时说明状态", async () => {
  vi.mocked(loadTaskGitDiff).mockRejectedValueOnce(new Error("offline"));
  vi.mocked(loadTaskGitDiff).mockResolvedValue({ supported: false });
  render(<GitDiff {...props} filePath="/project/image.png" />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText(/当前没有可预览的文本差异/)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
