/* 云枫动效词汇：短促反馈、轻量进入与无回弹布局；时间单位为秒。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { Transition } from "motion/react";

export const motionTiming = { exit: 0.1, fast: 0.14, enter: 0.18, feedback: 0.22, progress: 0.24, layout: 0.26 } as const;
export const motionEase = [0.23, 1, 0.32, 1] as const;
export const motionPresets = {
  enter: { type: "tween", duration: motionTiming.fast, ease: motionEase },
  exit: { type: "tween", duration: motionTiming.exit, ease: motionEase },
  feedback: { type: "tween", duration: motionTiming.feedback, ease: motionEase },
  progress: { type: "tween", duration: motionTiming.progress, ease: motionEase },
  layout: { type: "spring", duration: motionTiming.layout, bounce: 0 },
  lift: { type: "tween", duration: motionTiming.fast, ease: motionEase },
  snap: { type: "tween", duration: motionTiming.fast, ease: motionEase },
  return: { type: "tween", duration: motionTiming.enter, ease: motionEase },
} satisfies Record<string, Transition>;
export type MotionPreset = keyof typeof motionPresets;

/** 减少动态效果时立即呈现；不延迟事实更新或业务提交。 */
export function motionTransition(preset: MotionPreset, reduced = false): Transition {
  return reduced ? { type: "tween", duration: 0 } : motionPresets[preset];
}
