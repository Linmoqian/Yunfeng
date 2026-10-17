/* 团队交互核心回归：折叠草稿、输入法发送边界与告示牌失败恢复。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import type { TeamWorkspace } from "../src/features/workbench/hooks/useTeamWorkspace";
import { TeamChat } from "../src/features/workbench/components/TeamChat";
import { TeamContacts } from "../src/features/workbench/components/TeamContacts";
import { TeamNoticeBoard } from "../src/features/workbench/components/TeamNoticeBoard";
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("matchMedia", () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
function workspace(extra = {}): TeamWorkspace {
  return { available: true, busy: false, notice: "", team: { id: "local", name: "研究组", owner: "工程师", members: ["工程师"] }, snapshot: null, messages: [], board: "本周核对实验结果", links: [{ title: "资料", url: "https://example.com" }], send: vi.fn().mockResolvedValue(true), saveBoard: vi.fn().mockResolvedValue(true), create: vi.fn(), ...extra } as unknown as TeamWorkspace;
}

test("通讯录展开支持键盘，收起后保留创建草稿，不误触提交", async () => {
  const state = workspace({ team: null });
  render(<App><TeamContacts state={state} onBack={vi.fn()} /></App>);
  await userEvent.type(screen.getByLabelText("团队名称"), "实验室");
  await userEvent.type(screen.getByLabelText("你的名称"), "工程师");
  const toggle = screen.getByRole("button", { name: "创建本地团队" });
  await userEvent.click(toggle);
  await waitFor(() => expect(screen.queryByLabelText("团队名称")).toBeNull());
  toggle.focus(); await userEvent.keyboard("{Enter}");
  expect((screen.getByLabelText("团队名称") as HTMLInputElement).value).toBe("实验室");
  expect(state.create).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "创建团队" }));
  expect(state.create).toHaveBeenCalledWith("实验室", "工程师");
});

test("团队消息遵守输入法与换行边界，失败保留草稿和幂等标识，确认后清空", async () => {
  const state = workspace({ send: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true) });
  render(<TeamChat state={state} onBack={vi.fn()} />);
  const input = screen.getByLabelText("团队消息", { selector: "textarea" }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "核对实验" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(state.send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(state.send).toHaveBeenCalledTimes(1));
  expect(input.value).toBe("核对实验");
  const id = vi.mocked(state.send).mock.calls[0][0];
  await userEvent.click(screen.getByRole("button", { name: "发送团队消息" }));
  await waitFor(() => expect(input.value).toBe(""));
  expect(state.send).toHaveBeenLastCalledWith(id, "核对实验");
});

test("告示牌失败保留草稿与链接，成功读取权威快照，取消归还焦点，未建团队禁用编辑", async () => {
  const state = workspace({ saveBoard: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true) });
  const view = render(<TeamNoticeBoard state={state} />);
  await userEvent.click(screen.getByRole("button", { name: "编辑团队公告" }));
  const editor = await screen.findByLabelText("团队公告");
  await userEvent.clear(editor); await userEvent.type(editor, "周五复核实验，保留原始记录");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect((editor as HTMLTextAreaElement).value).toContain("周五复核");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(state.saveBoard).toHaveBeenLastCalledWith("周五复核实验，保留原始记录", state.links);
  view.rerender(<TeamNoticeBoard state={{ ...state, board: "周五复核实验，保留原始记录" }} />);
  await waitFor(() => expect(screen.queryByLabelText("团队公告")).toBeNull());
  expect(screen.getByText("周五复核实验，保留原始记录")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "编辑团队公告" }));
  const next = await screen.findByLabelText("团队公告");
  fireEvent.keyDown(next, { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "编辑团队公告" })));
  view.rerender(<TeamNoticeBoard state={{ ...state, team: null }} />);
  expect((screen.getByRole("button", { name: "编辑团队公告" }) as HTMLButtonElement).disabled).toBe(true);
});
