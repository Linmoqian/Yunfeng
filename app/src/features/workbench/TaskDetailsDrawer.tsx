import { Drawer } from "antd";

import type { ModelCatalog, TaskState } from "../../services/taskService";
import { GitChanges } from "./components/GitChanges";
import { RunConfig } from "./components/RunConfig";
import { RunControlBar } from "./components/RunControlBar";

interface TaskDetailsDrawerProps {
  open: boolean;
  task: TaskState;
  modelCatalog?: ModelCatalog;
  onClose: () => void;
}

export function TaskDetailsDrawer({
  open,
  task,
  modelCatalog,
  onClose,
}: TaskDetailsDrawerProps) {
  return (
    <Drawer
      title="任务详情"
      placement="right"
      width={440}
      open={open}
      onClose={onClose}
      className="task-details-drawer"
    >
      <section className="task-details-drawer__section" aria-label="运行控制">
        <h3>运行控制</h3>
        <RunControlBar task={task} />
      </section>
      <section className="task-details-drawer__section" aria-label="运行配置">
        <RunConfig task={task} modelCatalog={modelCatalog} />
      </section>
      <section className="task-details-drawer__section" aria-label="Git 改动">
        <GitChanges taskId={task.id} />
      </section>
    </Drawer>
  );
}
