/* 列表与看板只映射业务状态，外观和反馈由共享组件库维护。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { Capsule, type CapsuleProps } from "@yunfeng/ui";
import type { TaskState, TaskStatus } from "@/lib/types";
import { statusLabel } from "@/lib/taskLabels";

const tones: Record<TaskStatus, CapsuleProps["tone"]> = {
  running: "accent", waiting_approval: "warning", waiting_input: "warning",
  failed: "danger", completed: "success", archived: "neutral",
};

export function TaskStatusCapsule({ task }: { task: TaskState }) {
  return <Capsule tone={tones[task.status]} status={task.status} value={task.status} animateOnMount={false}>
    {statusLabel(task)}
  </Capsule>;
}
