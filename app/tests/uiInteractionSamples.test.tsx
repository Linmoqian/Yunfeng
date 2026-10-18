/* 审阅样例的关键交互：队列稳定身份、中文组字与模式和事实更新。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { CapsuleSample, ModeSample, QueueSample } from "../src/routes/ui-library/InteractionSamples";
vi.stubGlobal("scrollTo", () => undefined);
afterEach(cleanup);

test("队列组字不入队，移除前项保留后项节点，清空后能再次添加", async () => {
  render(<QueueSample />);
  const input = screen.getByRole("textbox", { name: "样例排队消息内容" });
  fireEvent.change(input, { target: { value: "实验记录" } });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter", isComposing: true });
  expect(screen.queryByRole("list")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "添加样例" }));
  await userEvent.click(screen.getByRole("button", { name: "添加样例" }));
  const retained = screen.getByText("核对实验记录 2");
  await userEvent.click(screen.getByRole("button", { name: "移除消息：核对实验记录 1" }));
  expect(screen.getByText("核对实验记录 2")).toBe(retained);
  expect(document.activeElement).toBe(input);
  await userEvent.click(screen.getByRole("button", { name: "清空" }));
  await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
  fireEvent.change(input, { target: { value: "重新核对" } });
  await userEvent.type(input, "{Enter}");
  expect(screen.getByText("重新核对")).toBeTruthy();
});

test("模式切换立即选中，胶囊更新保留同一节点并展示新事实", async () => {
  render(<><ModeSample /><CapsuleSample /></>);
  await userEvent.click(screen.getByText("科研"));
  expect((screen.getByRole("radio", { name: "科研" }) as HTMLInputElement).checked).toBe(true);
  const capsule = screen.getByText("提升 8.2%");
  await userEvent.click(screen.getByRole("button", { name: "更新指标" }));
  expect(screen.getByText("提升 14.4%")).toBe(capsule);
  expect(screen.getByText("验收通过")).toBeTruthy();
});
