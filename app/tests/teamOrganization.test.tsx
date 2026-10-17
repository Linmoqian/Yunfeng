/* 团队组织核心交互：IPC 确认、直属范围、失败草稿与候选限制。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeamMemberList } from "../src/features/workbench/components/TeamMemberList";
import { useTeamWorkspace } from "../src/features/workbench/hooks/useTeamWorkspace";
import type { CollaborationSnapshot, MemberCard } from "../src/features/workbench/services/collaborationService";
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("../src/components/titlebar/windowPlatform", () => ({ getRuntimeWindowPlatform: () => "macos" }));
vi.mock("../src/features/workbench/services/collaborationService", () => ({ collaborationAction: action, collaborationError: () => "保存失败" }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("matchMedia", () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); action.mockReset(); });
function member(id: string, name: string, nodeId = "local"): MemberCard {
  return { id, nodeId, profile: { name, kind: "agent", access: "contributor", summary: "实验记录", enabled: true, robotControl: false, robot: null, assistant: { model: "local-model", provider: "local", skills: ["记录"] } } };
}
const participants = [member("a", "工程师"), member("b", "助手"), member("c", "程序"), member("d", "远端", "remote")];
const snapshot: CollaborationSnapshot = { installationId: "local", mode: "local", team: { id: "team", name: "研究组", owner: "工程师", members: [] }, savedTeams: [], participants, relations: [{ memberId: "b", parentId: "a" }, { memberId: "c", parentId: "b" }], messages: [], board: "", links: [], networkAvailable: false };
function Harness() { const state = useTeamWorkspace(true); return <TeamMemberList state={state} />; }
async function focus(name: string) { await userEvent.click(await screen.findByRole("button", { name: `查看直属成员：${name}` })); }
async function details(name: string) { await userEvent.click(await screen.findByRole("button", { name: `查看成员：${name}`, exact: true })); return screen.findByRole("combobox", { name: "直属上级" }); }

test("仅展开直属层，铭牌展示助手与权限，候选排除自身和后代，关闭归还焦点", async () => {
  action.mockResolvedValue(snapshot);
  render(<Harness />);
  await focus("工程师");
  const list = await screen.findByRole("list", { name: "工程师的直属成员" });
  expect(within(list).getByRole("button", { name: "查看成员：助手", exact: true })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "查看成员：程序", exact: true })).toBeNull();
  const combo = await details("助手");
  expect(screen.getByText("local-model")).toBeTruthy();
  expect(screen.getByText("协作", { exact: true })).toBeTruthy();
  await userEvent.click(combo);
  expect(screen.queryByRole("option", { name: "助手" })).toBeNull();
  expect(screen.queryByRole("option", { name: "程序" })).toBeNull();
  expect(screen.getByRole("option", { name: "工程师" })).toBeTruthy();
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "关闭成员详情" })).toBeTruthy();
  screen.getByRole("dialog", { name: "成员详情：助手" }).focus();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("button", { name: "关闭成员详情" })).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "查看成员：助手", exact: true }));
});

test("调整与解除经 IPC 确认后才更新图，失败保留选择，保存中阻止重复提交", async () => {
  action.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error("offline"));
  render(<Harness />);
  await focus("工程师");
  await userEvent.click(await details("助手"));
  await userEvent.click(screen.getByRole("option", { name: "远端" }));
  expect(action).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("button", { name: "保存直属关系" }) as HTMLButtonElement).disabled).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "保存直属关系" }));
  expect(action).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "直属上级" }).parentElement?.textContent).toContain("远端");
  expect(screen.getByRole("list", { name: "工程师的直属成员" }).textContent).toContain("助手");
  let confirm!: (value: CollaborationSnapshot) => void;
  action.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
  const save = screen.getByRole("button", { name: "保存直属关系" });
  fireEvent.click(save); fireEvent.click(save);
  expect(action).toHaveBeenCalledTimes(3);
  expect(action).toHaveBeenLastCalledWith({ action: "relation", relation: { memberId: "b", parentId: "d" } });
  confirm({ ...snapshot, relations: [{ memberId: "b", parentId: "d" }, { memberId: "c", parentId: "b" }] });
  await waitFor(() => expect(screen.queryByRole("button", { name: "查看成员：助手", exact: true })).toBeNull());
  await userEvent.click(screen.getByRole("combobox", { name: "组织视角" }));
  await userEvent.click(screen.getByRole("option", { name: "远端" }));
  await details("助手");
  await userEvent.click(screen.getByRole("combobox", { name: "直属上级" }));
  await userEvent.click(screen.getByRole("option", { name: "独立成员" }));
  action.mockResolvedValueOnce({ ...snapshot, relations: [{ memberId: "b", parentId: null }, { memberId: "c", parentId: "b" }] });
  await userEvent.click(screen.getByRole("button", { name: "保存直属关系" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "查看成员：助手", exact: true })).toBeNull());
  expect(action).toHaveBeenLastCalledWith({ action: "relation", relation: { memberId: "b", parentId: null } });
});

test("远端成员展示资料但不能在本机调整关系与权限", async () => {
  action.mockResolvedValue(snapshot);
  render(<Harness />);
  await userEvent.click(await screen.findByRole("button", { name: "查看成员：远端", exact: true }));
  expect(screen.getByText("直属关系由所属节点管理")).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "直属上级" })).toBeNull();
  expect(screen.queryByRole("button", { name: "编辑成员：远端" })).toBeNull();
});
