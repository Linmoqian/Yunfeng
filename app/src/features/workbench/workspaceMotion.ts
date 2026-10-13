/* 移植 LianAgent 的结构与会话动效预设。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import type { Transition } from "motion/react";
export const SPRING_LAYOUT: Transition = { type: "spring", duration: 0.26, bounce: 0 };
export const SESSION_ENTER: Transition = { type: "tween", duration: 0.14, ease: [0.23, 1, 0.32, 1] };
export const SESSION_EXIT: Transition = { type: "tween", duration: 0.1, ease: [0.23, 1, 0.32, 1] };
