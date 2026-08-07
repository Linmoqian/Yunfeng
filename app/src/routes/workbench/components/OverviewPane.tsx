import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { Button } from "antd";

import { MapleStatusMark } from "../../../features/workbench/MapleStatusMark";

interface OverviewPaneProps {
  activeTaskCount: number;
  taskCount: number;
  attentionCount: number;
  hasAny: boolean;
  onNewTask: () => void;
}

export function OverviewPane({
  activeTaskCount,
  taskCount,
  attentionCount,
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
        <p className="eyebrow">任务工作台</p>
        <h1 id="workbench-title">管理编码任务。</h1>
        <p>
          任务由后端领域状态驱动：运行、等待继续、等待审批、失败与完成都以真实状态为准。
          旧会话保留浏览，首次操作时自动接入任务体系。
        </p>
      </div>
      <div className="session-overview__summary">
        <div>
          <strong>{activeTaskCount}</strong>
          <span>个活跃任务</span>
        </div>
        <div>
          <strong>{taskCount}</strong>
          <span>个任务</span>
        </div>
        {attentionCount > 0 ? (
          <div className="session-overview__summary--attention">
            <strong>{attentionCount}</strong>
            <span>需要处理</span>
          </div>
        ) : null}
      </div>
      {!hasAny ? (
        <EmptyState onNewTask={onNewTask} />
      ) : (
        <motion.div
          className="session-overview__hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.3 }}
        >
          <MapleStatusMark />
          <p>从左侧打开一个任务或会话，继续推进。</p>
        </motion.div>
      )}
    </motion.section>
  );
}

function EmptyState({ onNewTask }: { onNewTask: () => void }) {
  return (
    <section className="empty-state" aria-live="polite">
      <MapleStatusMark />
      <h2>工作台暂时安静。</h2>
      <p>还没有任务。可以从一句清晰的话开始。</p>
      <Button type="primary" icon={<Plus size={16} />} onClick={onNewTask}>
        新建任务
      </Button>
    </section>
  );
}
