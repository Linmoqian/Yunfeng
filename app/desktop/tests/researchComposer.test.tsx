/* 科研补充目标保持单一发送路径，开发会话仍可停止生成。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "../src/features/workbench/components/Composer";

// jsdom 不测布局；真实尺寸与自动增高由原生窗口验收。
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);
const props = { isDraft: false, running: true, isLegacy: false, sending: false, streamStatus: "streaming" as const, stopping: false };

test("科研运行时仅补充目标，不提供重复停止或两种调度选项", async () => {
  const onSubmit = vi.fn(async () => {}), onStop = vi.fn(async () => {});
  render(<Composer {...props} research onSubmit={onSubmit} onStop={onStop} />);
  expect(screen.queryByRole("button", { name: "停止生成" })).toBeNull();
  await userEvent.type(screen.getByRole("textbox"), "比较更低耗时的参数");
  expect(screen.queryByRole("button", { name: "消息处理方式" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("比较更低耗时的参数");
  expect(onStop).not.toHaveBeenCalled();
});

test("开发会话运行时可停止生成，输入消息直接排队", async () => {
  const onStop = vi.fn(async () => {});
  const onSubmit = vi.fn(async () => {});
  render(<Composer {...props} onSubmit={onSubmit} onStop={onStop} />);
  await userEvent.click(screen.getByRole("button", { name: "停止生成" }));
  expect(onStop).toHaveBeenCalledOnce();
  await userEvent.type(screen.getByRole("textbox"), "补充需求");
  expect(screen.queryByRole("button", { name: "消息处理方式" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "发送到下一轮" }));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("补充需求");
});
