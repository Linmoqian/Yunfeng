/* 科研组件呈现回归：报告事实、真实验收和默认折叠，不显示其他作业的验收。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchReport } from "../src/features/workbench/components/ResearchReport";
import type { ResearchComponentSnapshot } from "../src/services/researchComponent";

afterEach(cleanup);
const snapshot: ResearchComponentSnapshot = { component: "research", revision: 1, state: {
  jobId: "job-1", source: "report.json", updatedAt: "2026-10-16T00:00:00Z",
  progress: { label: "实验", current: 2, total: 2 }, metrics: [{ label: "减小", value: 14.4, unit: "%" }],
  conclusion: { summary: "当前语料已达到目标。独立数据尚未验证。", details: "原始实验过程" },
}, result: { job_id: "job-1", status: "succeeded", output: "真实命令输出", evaluation: { passed: true, reason: "completed == 1" } } };

test("结构化指标与限制直接展示，详细过程需要展开", async () => {
  render(<ResearchReport snapshot={snapshot} />);
  expect(screen.getByRole("progressbar", { name: "实验" }).getAttribute("aria-valuenow")).toBe("2");
  expect(screen.getByText("减小 14.4 %")).toBeTruthy();
  expect(screen.getByText("节点验收通过")).toBeTruthy();
  expect(screen.getByText(/独立数据尚未验证/)).toBeTruthy();
  expect(screen.queryByText("原始实验过程")).toBeNull();
  expect(screen.queryByText("真实命令输出")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "详细过程" }));
  expect(screen.getByText("原始实验过程")).toBeTruthy();
  expect(screen.getByText("真实命令输出")).toBeTruthy();
  expect(screen.getByText("report.json")).toBeTruthy();
});

test("指标存在不代表通过，失败和中断保留可见状态", () => {
  const { rerender } = render(<ResearchReport snapshot={{ ...snapshot, result: { job_id: "other-job", status: "succeeded", evaluation: { passed: true, reason: "其他任务" } } }} />);
  expect(screen.queryByText("节点验收通过")).toBeNull();
  rerender(<ResearchReport snapshot={{ ...snapshot, result: { job_id: "job-1", status: "failed", evaluation: { passed: false, reason: "实际未达标" } } }} />);
  expect(screen.getByText("节点验收未通过")).toBeTruthy();
  rerender(<ResearchReport snapshot={{ ...snapshot, result: { job_id: "job-1", status: "cancelled" } }} />);
  expect(screen.getByText("执行中断")).toBeTruthy();
});

test("事实更新立即可读，保留已展开过程与键盘焦点", async () => {
  const { rerender } = render(<ResearchReport snapshot={{ ...snapshot, result: undefined, state: {
    ...snapshot.state, progress: { label: "实验", current: 1, total: 2 }, metrics: [{ label: "减小", value: 0, unit: "%" }],
  } }} />);
  const progress = screen.getByRole("progressbar", { name: "实验" });
  const trigger = screen.getByRole("button", { name: "详细过程" });
  await userEvent.click(trigger);
  trigger.focus();
  rerender(<ResearchReport snapshot={{ ...snapshot, revision: 2 }} />);
  expect(screen.getByRole("progressbar", { name: "实验" })).toBe(progress);
  expect(progress.getAttribute("aria-valuenow")).toBe("2");
  expect(screen.getByText("减小 14.4 %")).toBeTruthy();
  expect(screen.queryByText("减小 0 %")).toBeNull();
  expect(screen.getByText("节点验收通过")).toBeTruthy();
  expect(screen.getByText("原始实验过程")).toBeTruthy();
  expect(document.activeElement).toBe(trigger);
  await userEvent.keyboard("{Enter}");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

test("文献来源默认折叠，展开后可访问原链接且不加载外部图片", async () => {
  render(<ResearchReport snapshot={{ ...snapshot, state: { ...snapshot.state,
    metrics: [{ label: "文献", value: 2 }, { label: "双源候选", value: 2 }],
    conclusion: { summary: "找到双源候选，独立数据仍待核验。", details: "[文献一](https://doi.org/10.1234/one)\n\n[文献二](https://doi.org/10.1234/two)\n\n![不加载](https://example.com/image.png)" },
  } }} />);
  expect(screen.getByText("双源候选 2")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "文献一" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "详细过程" }));
  expect(screen.getByRole("link", { name: "文献一" }).getAttribute("href")).toBe("https://doi.org/10.1234/one");
  expect(screen.getByRole("link", { name: "文献二" }).getAttribute("rel")).toBe("noreferrer");
  expect(screen.queryByRole("img")).toBeNull();
});
