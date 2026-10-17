/* 共用手势取消遵守中文输入并使用最新回调，关闭和卸载后不再接管键盘。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useGestureCancellation } from "../src/components/common";
afterEach(cleanup);

test("中文组字不取消；Escape、失焦使用最新回调，仅在手势期间监听", () => {
  const first = vi.fn(), latest = vi.fn();
  const hook = renderHook(({ active, cancel }) => useGestureCancellation(active, cancel), { initialProps: { active: true, cancel: first } });
  fireEvent.keyDown(window, { key: "Escape", isComposing: true });
  expect(first).not.toHaveBeenCalled();
  hook.rerender({ active: true, cancel: latest });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce();
  fireEvent.blur(window); expect(latest).toHaveBeenCalledTimes(2);
  hook.rerender({ active: false, cancel: latest });
  fireEvent.keyDown(window, { key: "Escape" }); fireEvent.blur(window);
  expect(latest).toHaveBeenCalledTimes(2);
  hook.rerender({ active: true, cancel: latest }); hook.unmount();
  fireEvent.keyDown(window, { key: "Escape" }); fireEvent.blur(window);
  expect(latest).toHaveBeenCalledTimes(2);
});
