/* 模式连续切换保留控件身份与键盘操作，只播报当前说明。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationWelcome } from "../src/features/workbench/components/ConversationWelcome";

afterEach(cleanup);
function Welcome() {
  const [mode, setMode] = useState<"development" | "research">("development");
  return <ConversationWelcome mode={mode} onModeChange={setMode} />;
}

test("模式连续切换、方向键操作保留原控件，只播报当前说明", async () => {
  render(<Welcome />);
  const user = userEvent.setup();
  const mascot = screen.getByRole("img", { name: "云枫吉祥物" });
  const modes = within(screen.getByLabelText("工作模式"));
  const research = screen.getByRole("radio", { name: "科研" });
  await user.click(modes.getByText("科研", { exact: true }));
  expect((screen.getByRole("radio", { name: "科研" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText("编写代码、排查问题，或构建应用。").getAttribute("aria-hidden")).toBe("true");
  await user.click(modes.getByText("开发", { exact: true }));
  await user.click(modes.getByText("科研", { exact: true }));
  research.focus();
  fireEvent.keyDown(research, { key: "ArrowLeft" });
  expect((screen.getByRole("radio", { name: "开发" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText("输入研究目标，云枫将自主推进。").getAttribute("aria-hidden")).toBe("true");
  expect(screen.getByRole("img", { name: "云枫吉祥物" })).toBe(mascot);
  expect(screen.getByRole("radio", { name: "科研" })).toBe(research);
});
