/* 单轮摘要回归：服务端行数、历史隔离、完整总计及键盘关闭。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeSummary } from "../src/features/workbench/components/ChangeSummary";
import { loadTaskGit, loadTaskGitDiff } from "../src/services/taskService";

vi.mock("../src/services/taskService", () => ({ loadTaskGit: vi.fn(), loadTaskGitDiff: vi.fn() }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const computedStyle = window.getComputedStyle;
beforeEach(() => { vi.spyOn(window, "getComputedStyle").mockImplementation((element) => computedStyle(element)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });
const oldFile = { filePath: "/project/preexisting.ts", status: "modified" };
const file = { filePath: "/project/source.ts", status: "modified", additions: 2, deletions: 1 };
const summary = { isGitRepository: true, repositoryRoot: "/project", files: [oldFile, file], taskFiles: [], baselineFiles: [oldFile], baseline: [oldFile.filePath], round: { id: "round-1", startedAt: "2026-10-16", root: "/project", files: [file] } };

test("只显示本轮文件和服务端行数，Escape 归还焦点，旧记录不混入", async () => {
  vi.mocked(loadTaskGit).mockResolvedValue(summary);
  const view = render(<ChangeSummary taskId="task-1" revision="idle" />);
  const button = await screen.findByRole("button", { name: /1 个文件已更改 · 本轮/ });
  expect(screen.getByLabelText("增加 2 行")).toBeTruthy();
  await userEvent.click(button);
  expect(await screen.findByText("source.ts")).toBeTruthy();
  expect(screen.queryByText("preexisting.ts")).toBeNull();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(button.getAttribute("aria-expanded")).toBe("false"));
  expect(document.activeElement).toBe(button);
  vi.mocked(loadTaskGit).mockResolvedValue({ ...summary, round: null });
  view.rerender(<ChangeSummary taskId="task-1" revision="next" />);
  await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
});

test("总计包含折叠清单外的文件，二进制保留未知统计", async () => {
  const files = Array.from({ length: 21 }, (_, i) => ({ ...file, filePath: `/project/file-${i}.ts` }));
  vi.mocked(loadTaskGit).mockResolvedValue({ ...summary, round: { ...summary.round, files } });
  const view = render(<ChangeSummary taskId="task-2" revision="idle" />);
  expect(await screen.findByLabelText("增加 42 行")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /21 个文件已更改/ }));
  expect(await screen.findByText(/展示前 20 项/)).toBeTruthy();
  vi.mocked(loadTaskGit).mockResolvedValue({ ...summary, round: { ...summary.round, files: [{ ...file, additions: null, deletions: null }] } });
  view.rerender(<ChangeSummary taskId="task-2" revision="done" />);
  expect(await screen.findByText("不支持统计")).toBeTruthy();
  expect(screen.queryByLabelText("增加 0 行")).toBeNull();
});

test("开发模式按需读取真实 diff，关闭后归还胶囊焦点", async () => {
  vi.mocked(loadTaskGit).mockResolvedValue(summary);
  vi.mocked(loadTaskGitDiff).mockResolvedValue({ supported: true, patch: "@@ -1 +1 @@\n-old\n+new" });
  render(<ChangeSummary taskId="task-1" revision="idle" allowDiff />);
  const trigger = await screen.findByRole("button", { name: /1 个文件已更改/ });
  await userEvent.click(trigger);
  expect(loadTaskGitDiff).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole("button", { name: "查看 source.ts 的 Git diff" }));
  expect(await screen.findByText("+new")).toBeTruthy();
  expect(screen.getByText("当前工作区")).toBeTruthy();
  expect(loadTaskGitDiff).toHaveBeenCalledWith("task-1", file.filePath, expect.any(AbortSignal));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", keyCode: 27 });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
