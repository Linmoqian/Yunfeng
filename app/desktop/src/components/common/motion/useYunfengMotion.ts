/* 统一响应系统减少动态效果偏好，供组件与手势共用。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useReducedMotion, type Transition } from "motion/react";
import { motionTransition, type MotionPreset } from "./presets";

export interface YunfengMotion { reduced: boolean; transition: (preset: MotionPreset) => Transition }
export function useYunfengMotion(): YunfengMotion {
  const reduced = Boolean(useReducedMotion());
  return { reduced, transition: (preset: MotionPreset) => motionTransition(preset, reduced) };
}
