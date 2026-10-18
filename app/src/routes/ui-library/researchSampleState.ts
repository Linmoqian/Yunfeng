/* 科研 UI 演示的有限状态机，所有事实均为固定样例，不执行真实实验。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
export type SamplePhase = "waiting" | "observe" | "decide" | "execute" | "reflect" | "complete";
export type ResearchSampleState = { phase: SamplePhase; paused: boolean; automatic: boolean; round: number; progress: number; finished: number; hooks: number; log: string[] };
export type SampleAction = { type: "hook" | "next" | "pause" | "resume" | "automatic" | "reset" };
export const samplePhaseLabels: Record<SamplePhase, string> = { waiting: "等待 Hook", observe: "观察", decide: "决策", execute: "执行", reflect: "反思", complete: "已完成" };
export const initialResearchSample: ResearchSampleState = { phase: "waiting", paused: false, automatic: false, round: 0, progress: 0, finished: 0, hooks: 0, log: ["等待项目事件，不调用模型。"] };
const append = (state: ResearchSampleState, patch: Partial<ResearchSampleState>, message: string): ResearchSampleState => ({ ...state, ...patch, log: [...state.log, message] });
export function researchSampleReducer(state: ResearchSampleState, action: SampleAction): ResearchSampleState {
  if (action.type === "reset") return initialResearchSample;
  if (action.type === "automatic") return { ...state, automatic: !state.automatic };
  if (action.type === "pause") return state.paused || state.phase === "complete" ? state : append(state, { paused: true }, `暂停，保留${samplePhaseLabels[state.phase]}阶段。`);
  if (action.type === "resume") return state.paused ? append(state, { paused: false }, `继续${samplePhaseLabels[state.phase]}阶段。`) : state;
  if (state.paused || state.phase === "complete") return state;
  if (action.type === "hook") return state.phase !== "waiting" ? state : append(state, { phase: "observe", hooks: state.hooks + 1 }, state.round === 0 ? "文件 Hook：样例数据就绪，重新读取事实。" : "文件 Hook：样例复核通过，重新读取事实。");
  if (action.type !== "next") return state;
  switch (state.phase) {
    case "waiting": return state;
    case "observe": return append(state, { phase: "decide" }, "观察完成，向决策层提交本轮事实。");
    case "decide": return append(state, { phase: "execute", progress: 0 }, state.round === 0 ? "选择基线节点，生成受控实验计划。" : "根据基线反馈选择优化节点，生成实验计划。");
    case "execute": return state.progress === 0 ? append(state, { progress: 1 }, "样例作业运行至 1/2，尚未产生验收结果。") : append(state, { phase: "reflect", progress: 2, finished: state.round + 1 }, "样例作业完成事件：验收通过，进入反思。");
    case "reflect": return state.round === 0 ? append(state, { phase: "waiting", round: 1, progress: 0 }, "记录基线经验，等待复核 Hook，不自动轮询。") : append(state, { phase: "complete" }, "记录优化经验，样例长期目标验收通过，结束演示。");
  }
}
