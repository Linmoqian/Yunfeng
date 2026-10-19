/* 共享指针核心回归：区域定位、版本同步和输入焦点保留。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgentFocusOverlay } from "../src/features/workbench/components/AgentFocusOverlay";
import { componentFocus, focusElement, type ComponentFocus } from "../src/features/workbench/services/componentFocus";

vi.mock("../src/features/workbench/hooks/useComponentInteraction", () => ({ useComponentInteraction: () => ({ statuses: {}, error: false }) }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ getCurrentWebviewWindow: () => ({ label: "main" }) }));
let deliver: (snapshot: ComponentFocus) => void = () => {};
vi.spyOn(componentFocus, "subscribe").mockImplementation(async (callback) => { deliver = callback; return () => {}; });
vi.spyOn(componentFocus, "read").mockImplementation(async (component) => ({ component, revision: 0, target: null }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 40, y: 80, left: 40, top: 80, right: 440, bottom: 380, width: 400, height: 300, toJSON: () => {} });
afterEach(cleanup);

test("真实注册区域显示指针，切换和旧版本事件不抢输入焦点", async () => {
  render(<><section aria-label="论文文稿"><input aria-label="文稿标题" /><div role="region" aria-label="编辑视图"><textarea aria-label="正文" /></div></section><AgentFocusOverlay /></>);
  await waitFor(() => expect(componentFocus.read).toHaveBeenCalled());
  const input = screen.getByRole("textbox", { name: "正文" }); input.focus();
  act(() => deliver({ component: "writing", revision: 1, target: "body" }));
  expect(await screen.findByText("云枫 · 文稿正文")).toBeTruthy();
  expect(document.activeElement).toBe(input);
  expect(focusElement({ component: "writing", revision: 1, target: "body" })).toBe(screen.getByRole("region", { name: "编辑视图" }));
  act(() => deliver({ component: "writing", revision: 2, target: "name" }));
  expect(await screen.findByText("云枫 · 文稿标题")).toBeTruthy();
  act(() => deliver({ component: "writing", revision: 1, target: "body" }));
  expect(screen.queryByText("云枫 · 文稿正文")).toBeNull();
  act(() => deliver({ component: "writing", revision: 3, target: null }));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(document.activeElement).toBe(input);
});

test("隐藏区域明确标识未显示，不接受任意选择器", async () => {
  render(<AgentFocusOverlay />);
  await waitFor(() => expect(componentFocus.read).toHaveBeenCalled());
  act(() => deliver({ component: "resources", revision: 4, target: "files" }));
  expect(await screen.findByText("云枫 · 资源清单 · 未显示")).toBeTruthy();
  expect(focusElement({ component: "writing", revision: 5, target: "body > script" })).toBeNull();
});
