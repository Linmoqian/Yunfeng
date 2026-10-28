/* 标签拖放保留会话并允许移动到目标后方。
 * Created on 2026-10-28
 * @author: https://github.com/Linmoqian
 */
import { App } from "antd";
import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { expect, test } from "vitest";
import { WorkspaceTabs } from "../src/features/workbench/components/WorkspaceTabs";
import { useWorkspaceTabs } from "../src/features/workbench/hooks/useWorkspaceTabs";

function Example() {
  const tabs = useWorkspaceTabs();
  useEffect(() => { tabs.open({ id: "a", title: "甲", kind: "draft" }); tabs.open({ id: "b", title: "乙", kind: "draft" }); }, []);
  return <App><WorkspaceTabs tabs={tabs} onActivate={tabs.setActive} onClose={tabs.close} onNew={() => {}} onReopen={tabs.reopen} resolveTitle={(tab) => tab.title} /></App>;
}
test("拖动标签到目标后方时保留激活标签", () => {
  render(<Example />);
  const tabs = screen.getByRole("tablist");
  const first = screen.getByRole("tab", { name: "甲" }).parentElement!;
  const second = screen.getByRole("tab", { name: "乙" }).parentElement!;
  second.getBoundingClientRect = () => ({ left: 0, width: 100 } as DOMRect);
  const values = new Map<string, string>();
  const dataTransfer = { types: ["application/yunfeng-tab"], setData: (key: string, value: string) => values.set(key, value), getData: (key: string) => values.get(key) ?? "", effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(first, { dataTransfer });
  expect(values.get("application/yunfeng-tab")).toBe("a");
  const over = createEvent.dragOver(second, { dataTransfer });
  Object.defineProperty(over, "clientX", { value: 80 });
  fireEvent(second, over);
  expect(second.getAttribute("data-drop")).toBe("after");
  const drop = createEvent.drop(second, { dataTransfer });
  Object.defineProperty(drop, "clientX", { value: 80 });
  fireEvent(second, drop);
  expect(within(tabs).getAllByRole("tab").map((item) => item.textContent)).toEqual(["乙", "甲"]);
  expect(screen.getByRole("tab", { name: "乙" }).getAttribute("aria-selected")).toBe("true");
});
