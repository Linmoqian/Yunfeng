/* 拖放关系的核心边界：候选隔离、权限、取消及失败不伪造图状态。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { organizationDropCandidates, useOrganizationDrag } from "../src/features/workbench/hooks/useOrganizationDrag";
import type { TeamWorkspace } from "../src/features/workbench/hooks/useTeamWorkspace";
import type { MemberCard } from "../src/features/workbench/services/collaborationService";
const members = ["a", "b", "c", "d"].map((id) => ({ id, nodeId: id === "d" ? "remote" : "local", profile: { name: id, kind: "agent", access: "contributor", summary: "实验记录", enabled: true, robotControl: false, robot: null, assistant: null } })) as MemberCard[];
const relations = [{ memberId: "b", parentId: "a" }, { memberId: "c", parentId: "b" }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

test("排除原上级、自身与后代；远端及忙碌时不能开始拖动", () => {
  expect([...organizationDropCandidates("b", members, relations)]).toEqual(["", "d"]);
  const saveRelation = vi.fn();
  const state = { available: true, busy: false, participants: members, relations, snapshot: { installationId: "local" }, saveRelation } as unknown as TeamWorkspace;
  const { result, rerender } = renderHook(({ value }) => useOrganizationDrag(value), { initialProps: { value: state } });
  act(() => { expect(result.current.begin(members[3])).toBe(false); });
  expect(result.current.active).toBeNull();
  rerender({ value: { ...state, busy: true } });
  act(() => { expect(result.current.begin(members[1])).toBe(false); });
  expect(saveRelation).not.toHaveBeenCalled();
});

test("候选限定当前图，取消不写入；保存等待确认、拒绝重复并保留失败反馈", async () => {
  let confirm!: (saved: boolean) => void;
  const saveRelation = vi.fn(() => new Promise<boolean>((resolve) => { confirm = resolve; }));
  const state = { available: true, busy: false, participants: members, relations, snapshot: { installationId: "local" }, saveRelation } as unknown as TeamWorkspace;
  const { result } = renderHook(() => useOrganizationDrag(state));
  const scope = document.createElement("section"), target = document.createElement("div");
  target.dataset.dropMember = "d"; scope.append(target); document.body.append(scope);
  Object.defineProperty(result.current.scope, "current", { value: scope, configurable: true });
  const point = vi.fn(() => target);
  Object.defineProperty(document, "elementFromPoint", { value: point, configurable: true });
  act(() => { result.current.begin(members[1]); result.current.locate({ x: 20, y: 20 }); });
  expect(result.current.target).toBe("d");
  act(() => { result.current.cancel(); });
  await act(async () => { await result.current.commit("d"); });
  expect(saveRelation).not.toHaveBeenCalled();
  const foreign = document.createElement("div"); foreign.dataset.dropMember = "d";
  point.mockReturnValue(foreign);
  act(() => { result.current.begin(members[1]); result.current.locate({ x: 20, y: 20 }); });
  expect(result.current.target).toBeUndefined();
  let pending!: Promise<void>;
  act(() => { pending = result.current.commit("d"); });
  expect(result.current.saving).toBe(true);
  act(() => { expect(result.current.begin(members[0])).toBe(false); });
  expect(saveRelation).toHaveBeenCalledExactlyOnceWith("b", "d");
  await act(async () => { confirm(false); await pending; });
  expect(result.current.error).toContain("关系未保存");
  expect(state.relations).toEqual(relations);
  expect(result.current.saving).toBe(false);
});

test("首帧前释放的快速拖放也按真实候选提交，不残留浮起状态", async () => {
  const { fireEvent, render, screen, waitFor } = await import("@testing-library/react");
  const { DraggableMember } = await import("../src/features/workbench/components/DraggableMember");
  class Pointer extends MouseEvent { pointerId = 1; isPrimary = true; pointerType = "mouse"; }
  vi.stubGlobal("PointerEvent", Pointer);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  const capture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "setPointerCapture");
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { value: vi.fn(), configurable: true });
  const saveRelation = vi.fn().mockResolvedValue(true);
  const state = { available: true, busy: false, participants: members, relations, presence: [], snapshot: { installationId: "local" }, saveRelation } as unknown as TeamWorkspace;
  function Harness() {
    const drag = useOrganizationDrag(state);
    return <section ref={drag.scope}><DraggableMember member={members[2]} state={state} drag={drag} edit={() => {}} focus={() => {}} /><div data-drop-member="d">候选</div></section>;
  }
  try {
    render(<Harness />);
    const handle = document.querySelector('[title="拖动调整直属关系"]')!;
    const candidate = screen.getByText("候选");
    Object.defineProperty(document, "elementFromPoint", { value: () => candidate, configurable: true });
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(handle, { button: 0, clientX: 90, clientY: 50 });
    await waitFor(() => expect(saveRelation).toHaveBeenCalledExactlyOnceWith("c", "d"));
    await waitFor(() => expect(document.querySelector('[data-source="true"]')).toBeNull());
  } finally {
    if (capture) Object.defineProperty(HTMLElement.prototype, "setPointerCapture", capture);
    else Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
  }
});
