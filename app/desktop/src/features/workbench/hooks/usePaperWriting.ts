/* 三个写作插槽使用同一共享快照，视图选择属于本窗口。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { createContext, useContext, useRef, useState } from "react";
import { useSharedComponent } from "./useSharedComponent";
import { usePaperAssets } from "./usePaperAssets";
import type { ResearchDocument, ResearchToolId, ReadingSelection } from "../research-tools/model";
import { formatSelection, type FormatAction } from "../research-tools/documentEditing";
import { MAX_PAPER_BYTES, paperByteLength } from "../paperWriting";
export function usePaperWriting() {
  const shared = useSharedComponent("writing", 700);
  const [view, setView] = useState("编辑");
  const [validationError, setValidationError] = useState("");
  const [active, setActive] = useState<ResearchToolId>("writing");
  const [reading, updateReading] = useState<ReadingSelection>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  function setReading(value: ReadingSelection) { updateReading(value); if (value?.kind === "reference") setSelectedReferenceId(value.id); }
  const [selection, setSelection] = useState<[number, number]>([0, 0]);
  const [focusVersion, setFocusVersion] = useState(0);
  const positions = useRef<Partial<Record<ResearchToolId, [number, number]>>>({});
  const history = useRef<Partial<Record<ResearchToolId, { undo: ResearchDocument[]; redo: ResearchDocument[] }>>>({});
  const value = active === "writing" ? { name: shared.value.name, body: shared.value.body } : shared.value[active] ?? { name: "", body: "" };
  const materials = usePaperAssets();
  function write(patch: Partial<ResearchDocument>) {
    if (active === "writing") shared.update(patch);
    else shared.update({ [active]: { ...value, ...patch } });
  }
  function update(patch: Partial<ResearchDocument>) {
    if (patch.body !== undefined && (paperByteLength(patch.body) > MAX_PAPER_BYTES || patch.body.includes("\0"))) { setValidationError("文稿不能超过 64 KiB，也不能包含非文本内容"); return; }
    setValidationError("");
    const stack = history.current[active] ??= { undo: [], redo: [] };
    stack.undo = [...stack.undo, value].slice(-30); stack.redo = [];
    write(patch);
  }
  function travel(direction: "undo" | "redo") {
    const stack = history.current[active]; const previous = stack?.[direction].pop();
    if (!stack || !previous) return;
    stack[direction === "undo" ? "redo" : "undo"].push(value); write(previous);
  }
  function insert(text: string) {
    update({ body: value.body.slice(0, selection[0]) + text + value.body.slice(selection[1]) });
    setSelection([selection[0] + text.length, selection[0] + text.length]); setReading(null); setView("编辑"); setFocusVersion((v) => v + 1);
  }
  function format(action: FormatAction) {
    const result = formatSelection(value.body, selection, action); update({ body: result.content }); setSelection(result.selection); setFocusVersion((v) => v + 1);
  }
  function open(tool: ResearchToolId) {
    positions.current[active] = selection;
    setActive(tool); setReading(null); setSelection(positions.current[tool] ?? [0, 0]); setView("编辑"); setFocusVersion((v) => v + 1);
  }
  return { ...shared, error: shared.error || validationError, value, update, workspace: shared.value, updateWorkspace: shared.update, active, open, reading, setReading, selectedReferenceId, selection, setSelection, focusVersion, focusEditor: () => setFocusVersion((v) => v + 1), insert, format, undo: () => travel("undo"), redo: () => travel("redo"), view, setView, materials };
}
export const PaperWritingContext = createContext<ReturnType<typeof usePaperWriting> | null>(null);
export function usePaperContext() {
  const paper = useContext(PaperWritingContext);
  if (!paper) throw new Error("论文写作需要共享三栏上下文");
  return paper;
}
