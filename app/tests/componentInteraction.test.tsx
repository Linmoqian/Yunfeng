/* 核心交互反馈回归：呈现版本、编辑让出、失联与卸载回收。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useComponentInteraction } from "../src/features/workbench/hooks/useComponentInteraction";
import { useComponentPresentation } from "../src/features/workbench/hooks/useComponentPresentation";
import { componentInteraction, type ComponentInteraction, type InteractionReport } from "../src/features/workbench/services/componentInteraction";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ getCurrentWebviewWindow: () => ({ label: "main" }) }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 40, y: 80, left: 40, top: 80, right: 440, bottom: 380, width: 400, height: 300, toJSON: () => {} });
vi.spyOn(document, "hasFocus").mockReturnValue(true);
let version = 0;
const stop = vi.fn();
let deliver: (status: ComponentInteraction) => void = () => {};
vi.spyOn(componentInteraction, "subscribe").mockImplementation(async (callback) => { deliver = callback; return stop; });
const reports: InteractionReport[] = [];
vi.spyOn(componentInteraction, "report").mockImplementation(async (component, report) => {
  if (component === "writing") reports.push(report);
  return { component, version: ++version, known: true, visible: report.visible, rendered: report.renderedRevision === 7 && !report.editing, renderedRevision: report.renderedRevision, editing: report.editing, yielded: report.editing };
});
function Fixture({ pending = false }: { pending?: boolean }) {
  useComponentPresentation("writing", 7, true, pending);
  const { statuses, error } = useComponentInteraction();
  return <><section data-agent-component="writing"><textarea aria-label="正文" /></section><output>{error ? "同步失败" : statuses.writing?.editing ? "已让出" : statuses.writing?.rendered ? "已呈现" : "未确认"}</output></>;
}
afterEach(() => { cleanup(); reports.length = 0; stop.mockClear(); });
test("提交后确认呈现，编辑与未保存输入让出，旧事件不能恢复控制", async () => {
  const view = render(<Fixture />);
  await waitFor(() => expect(view.getByText("已呈现")).toBeTruthy());
  const input = view.getByRole("textbox");
  act(() => input.focus());
  await waitFor(() => expect(view.getByText("已让出")).toBeTruthy());
  expect(document.activeElement).toBe(input);
  act(() => deliver({ component: "writing", version: 0, known: true, visible: true, rendered: true, renderedRevision: 7, editing: false, yielded: false }));
  expect(view.getByText("已让出")).toBeTruthy();
  act(() => input.blur());
  view.rerender(<Fixture pending />);
  await waitFor(() => expect(reports.at(-1)?.renderedRevision).toBeNull());
  expect(reports.at(-1)?.editing).toBe(true);
  view.rerender(<Fixture />);
  await waitFor(() => expect(view.getByText("已呈现")).toBeTruthy());
  act(() => input.dispatchEvent(new WheelEvent("wheel", { bubbles: true })));
  await waitFor(() => expect(view.getByText("已让出")).toBeTruthy());
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2000);
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(view.getByText("已呈现")).toBeTruthy());
  clock.mockRestore();
  view.unmount(); expect(stop).toHaveBeenCalledOnce();
});
test("反馈失败不宣称可操作，后续报告恢复", async () => {
  const report = vi.spyOn(componentInteraction, "report");
  const implementation = report.getMockImplementation()!;
  report.mockRejectedValue(new Error("disconnected"));
  const view = render(<Fixture />);
  await waitFor(() => expect(view.getByText("同步失败")).toBeTruthy());
  report.mockImplementation(implementation);
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(view.getByText("已呈现")).toBeTruthy());
});
