import { App, Button, Space, Tag } from "antd";
import { CheckCircle2, CircleStop, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { sendTaskCommand, type TaskState } from "../../../services/taskService";

interface RunControlBarProps {
  task: TaskState;
}

export function RunControlBar({ task }: RunControlBarProps) {
  const { message } = App.useApp();
  const [busyCommand, setBusyCommand] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);

  const running = task.status === "running" || task.status === "waiting_approval";
  const completed = task.status === "completed";
  const busy = busyCommand !== null;

  async function runCommand(type: "abort" | "clearQueue" | "retry" | "complete") {
    setBusyCommand(type);
    try {
      if (type === "clearQueue") {
        await sendTaskCommand(task.id, { type: "clearQueue" });
        setQueueStatus("队列已清空");
        message.success("队列已清空。");
      } else {
        await sendTaskCommand(task.id, { type });
        const texts: Record<string, string> = {
          abort: "已请求中止当前运行。",
          retry: "已重置为等待继续，可重新发送目标。",
          complete: "任务已标记完成。",
        };
        message.success(texts[type]);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusyCommand(null);
    }
  }

  return (
    <div className="focus-panel__run-controls">
      <Space wrap>
        {running ? (
          <Button
            size="small"
            type="text"
            disabled={busy}
            onClick={() => void runCommand("abort")}
            icon={<CircleStop size={13} />}
          >
            中止运行
          </Button>
        ) : null}
        {running ? (
          <Button
            size="small"
            type="text"
            disabled={busy}
            onClick={() => void runCommand("clearQueue")}
            icon={<Trash2 size={13} />}
          >
            清空排队
          </Button>
        ) : null}
        {!running && !completed ? (
          <Button
            size="small"
            type="text"
            disabled={busy}
            onClick={() => void runCommand("retry")}
            icon={<RefreshCw size={13} />}
          >
            重试本轮
          </Button>
        ) : null}
        {!completed ? (
          <Button
            size="small"
            type="text"
            disabled={busy}
            onClick={() => void runCommand("complete")}
            icon={<CheckCircle2 size={13} />}
          >
            标记完成
          </Button>
        ) : null}
        {queueStatus ? <Tag>{queueStatus}</Tag> : null}
      </Space>
    </div>
  );
}
