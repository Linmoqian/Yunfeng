/* 变更摘要核心回归：真实 hunk 统计、未知行数与文件作用域提示。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeSummary } from "../src/features/workbench/components/ChangeSummary";
import { countPatchLines } from "../src/features/workbench/hooks/useChangeSummary";
import { loadTaskGit, loadTaskGitDiff } from "../src/services/taskService";

vi.mock("../src/services/taskService", () => ({ loadTaskGit: vi.fn(), loadTaskGitDiff: vi.fn() }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const summary = { isGitRepository: true, repositoryRoot: "/project", files: [{ filePath: "/project/source.ts", status: "modified" }], taskFiles: [], baselineFiles: [{ filePath: "/project/source.ts", status: "modified" }], baseline: ["/project/source.ts"] };
const patch = "diff --git a/source.ts b/source.ts\n--- a/source.ts\n+++ b/source.ts\n@@ -1,1 +1,2 @@\n-old\n+++literal\n+new\n\\ No newline at end of file";

test("展开才读取 diff，准确统计内容行并保留原有改动提示，Escape 归还焦点", async () => {
  expect(countPatchLines(patch)).toEqual({ additions: 2, deletions: 1 });
  expect(countPatchLines("Binary files differ")).toBeNull();
  vi.mocked(loadTaskGit).mockResolvedValue(summary);
  vi.mocked(loadTaskGitDiff).mockResolvedValue({ supported: true, patch });
  render(<ChangeSummary taskId="task-1" revision="idle" />);
  const button = await screen.findByRole("button", { name: "1 个文件已更改" });
  expect(loadTaskGitDiff).not.toHaveBeenCalled();
  await userEvent.click(button);
  expect((await screen.findAllByLabelText("增加 2 行")).length).toBeGreaterThan(0);
  expect(screen.getByText(/含 1 个任务前已有文件/)).toBeTruthy();
  expect(screen.getByText("source.ts")).toBeTruthy();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(button.getAttribute("aria-expanded")).toBe("false"));
  expect(document.activeElement).toBe(button);
});

test("不支持的 diff 不伪造零行，非 Git 目录不显示变更胶囊", async () => {
  vi.mocked(loadTaskGit).mockResolvedValue(summary);
  vi.mocked(loadTaskGitDiff).mockResolvedValue({ supported: false });
  render(<ChangeSummary taskId="task-2" revision="idle" />);
  await userEvent.click(await screen.findByRole("button", { name: "1 个文件已更改" }));
  expect(await screen.findByText("部分文件不支持行数统计")).toBeTruthy();
  expect(screen.queryByLabelText("增加 0 行")).toBeNull();
  cleanup();
  vi.mocked(loadTaskGit).mockResolvedValue({ ...summary, isGitRepository: false, files: [] });
  render(<ChangeSummary taskId="task-3" revision="idle" />);
  await waitFor(() => expect(loadTaskGit).toHaveBeenLastCalledWith("task-3", expect.any(AbortSignal)));
  expect(screen.queryByRole("button")).toBeNull();
});
