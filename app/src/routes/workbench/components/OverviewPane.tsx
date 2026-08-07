import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { Button } from "antd";

import { MapleStatusMark } from "../../../features/workbench/MapleStatusMark";

interface OverviewPaneProps {
  hasAny: boolean;
  onNewTask: () => void;
}

export function OverviewPane({
  hasAny,
  onNewTask,
}: OverviewPaneProps) {
  return (
    <motion.section
      key="overview"
      className="session-overview"
      aria-labelledby="workbench-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="session-overview__intro">
        <p className="eyebrow">开始工作</p>
        <h1 id="workbench-title">今天想完成什么？</h1>
        <p>新建一个任务，或从左侧继续最近的对话。</p>
        <Button type="primary" size="large" icon={<Plus size={17} />} onClick={onNewTask}>
          新建任务
        </Button>
      </div>
      {hasAny ? (
        <motion.div
          className="session-overview__hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.3 }}
        >
          <MapleStatusMark />
          <p>从左侧打开一个任务或会话，继续推进。</p>
        </motion.div>
      ) : null}
    </motion.section>
  );
}
