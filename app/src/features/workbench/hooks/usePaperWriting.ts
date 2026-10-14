/* 三个写作插槽使用同一共享快照，视图选择属于本窗口。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { createContext, useContext, useState } from "react";
import { useSharedComponent } from "./useSharedComponent";
export function usePaperWriting() {
  const shared = useSharedComponent("writing");
  const [view, setView] = useState("编辑");
  return { ...shared, view, setView };
}
export const PaperWritingContext = createContext<ReturnType<typeof usePaperWriting> | null>(null);
export function usePaperContext() {
  const paper = useContext(PaperWritingContext);
  if (!paper) throw new Error("论文写作需要共享三栏上下文");
  return paper;
}
