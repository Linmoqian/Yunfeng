/* 用户拖动优先于延迟到达的 Agent 焦点，并且旧请求不在松手后回放。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useResearchGraphComponent } from "../src/features/workbench/hooks/useResearchGraphComponent";
import { researchGraphComponent } from "../src/services/researchGraphComponent";
vi.mock("../src/services/researchGraphComponent", () => ({ researchGraphComponent: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
test("延迟聚焦在操作后被消费但不执行，下一次新请求才允许移动", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 400, top: 0, bottom: 400 } as DOMRect);
  const focus = vi.fn(async () => {});
  let resolve: (value: any) => void = () => {};
  let revision = 1;
  vi.mocked(researchGraphComponent).mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockImplementation(async () => ({ revision: 8, focus: { epoch: "server", revision, target: "exp" }, interaction: {} } as any));
  function View() { const control = useResearchGraphComponent("task", 8, focus); return <section ref={control.root} />; }
  render(<View />);
  await waitFor(() => expect(researchGraphComponent).toHaveBeenCalled());
  fireEvent.pointerDown(document);
  resolve({ focus: { epoch: "server", revision: 1, target: "exp" } });
  fireEvent.pointerUp(document);
  await new Promise((done) => setTimeout(done, 1400));
  expect(focus).not.toHaveBeenCalled();
  revision = 2;
  await waitFor(() => expect(focus).toHaveBeenCalledWith("exp"), { timeout: 1500 });
  expect(focus).toHaveBeenCalledOnce();
});
