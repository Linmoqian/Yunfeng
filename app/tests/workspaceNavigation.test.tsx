/* 会话组织核心交互：折叠、搜索、置顶、真实加载与错误恢复入口。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { App } from "antd";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceNavigation, type WorkspaceNavigationProps } from "../src/features/workbench/components/WorkspaceNavigation";
import type { TaskSummary } from "../src/features/workbench/taskPresentation";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("matchMedia", () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
afterEach(cleanup);
const tasks: TaskSummary[] = [
  { id: "done", sessionId: "done", title: "压缩实验", projectName: "lab", section: "completed", statusLabel: "已完成", currentAction: "已验证", updatedAt: "2026-10-16T08:00:00Z", isLegacy: false, status: "completed", phase: "done", cwd: "/lab" },
  { id: "run", sessionId: "run", title: "检查模型", projectName: "lab", section: "running", statusLabel: "正在进行", currentAction: "训练中", updatedAt: "2026-10-16T09:00:00Z", isLegacy: false, status: "running", phase: "implementing", cwd: "/lab" },
];
function props(overrides: Partial<WorkspaceNavigationProps> = {}): WorkspaceNavigationProps {
  return { tasks, search: "", archived: false, onSearch: vi.fn(), onOpen: vi.fn(), onNew: vi.fn(), onUtility: vi.fn(), onTeam: vi.fn(), onSettings: vi.fn(), onRename: vi.fn(), onArchive: vi.fn(), onReopen: vi.fn(), onArchivedChange: vi.fn(), ...overrides };
}
function view(value: WorkspaceNavigationProps) { return <App><WorkspaceNavigation {...value} /></App>; }

test("分组键盘折叠，搜索展示匹配项，外部切换会话展开所在组", async () => {
  const p = props();
  const result = render(view(p));
  const toggle = within(screen.getByRole("region", { name: "已完成" })).getByRole("button", { name: "已完成 1" });
  toggle.focus();
  await userEvent.keyboard("{Enter}");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "打开任务：压缩实验" })).toBeNull();
  result.rerender(view({ ...p, search: "压缩", tasks: [tasks[0]] }));
  await userEvent.click(screen.getByRole("button", { name: "打开任务：压缩实验" }));
  expect(p.onOpen).toHaveBeenCalledWith(tasks[0]);
  result.rerender(view({ ...p, activeId: "done" }));
  expect(screen.getByRole("button", { name: "打开任务：压缩实验" }).getAttribute("aria-current")).toBe("page");
  await userEvent.click(screen.getByRole("button", { name: "已完成 1" }));
  result.rerender(view({ ...p, activeId: "done", tasks: [...tasks] }));
  expect(screen.queryByRole("button", { name: "打开任务：压缩实验" })).toBeNull();
});

test("置顶集中展示且不重复，取消后归回原状态组，归档入口保留", async () => {
  const p = props();
  render(view(p));
  await userEvent.click(screen.getByRole("button", { name: "打开“压缩实验”操作菜单" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "置顶会话" }));
  expect(within(screen.getByRole("region", { name: "置顶" })).getByRole("button", { name: "打开任务：压缩实验" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "打开任务：压缩实验" })).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "打开“压缩实验”操作菜单" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "取消置顶" }));
  expect(screen.queryByRole("region", { name: "置顶" })).toBeNull();
  expect(within(screen.getByRole("region", { name: "已完成" })).getByRole("button", { name: "打开任务：压缩实验" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "查看归档会话" }));
  expect(p.onArchivedChange).toHaveBeenCalledWith(true);
});

test("首次读取与失败不误报空列表，后台同步保留已有行并可重试", async () => {
  const p = props({ loading: true, tasks: [], onRetry: vi.fn() });
  const result = render(view(p));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("还没有会话")).toBeNull();
  result.rerender(view({ ...p, tasks }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "打开任务：检查模型" })).toBeTruthy();
  result.rerender(view({ ...p, loading: false, error: "HTTP 502" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("还没有会话")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "重试读取会话" }));
  expect(p.onRetry).toHaveBeenCalledOnce();
  result.rerender(view({ ...p, loading: false, search: "不存在" }));
  expect(screen.getByText("没有匹配的会话")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
  expect(p.onSearch).toHaveBeenCalledWith("");
});


test("深链接所选旧会话在列表到达后展开项目，保留旧会话的操作范围", async () => {
  const legacy: TaskSummary = { ...tasks[0], id: "legacy", isLegacy: true, section: "legacy", status: "history", phase: "unknown" };
  const p = props({ activeId: "legacy", tasks: [], loading: true });
  const result = render(view(p));
  result.rerender(view({ ...p, loading: false, tasks: [legacy] }));
  expect(screen.getByRole("button", { name: "收起lab会话" }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("button", { name: "打开任务：压缩实验" }).getAttribute("aria-current")).toBe("page");
  await userEvent.click(screen.getByRole("button", { name: "打开“压缩实验”操作菜单" }));
  expect(await screen.findByRole("menuitem", { name: "置顶会话" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "重命名" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "归档" })).toBeNull();
});
