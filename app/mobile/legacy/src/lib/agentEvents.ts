// Agent 实时状态：订阅 sidecar agent_update 事件，更新 Agent 面板状态。

import type { AgentEvent } from "./types";
import { agents as seedAgents, type AgentStatus } from "./data";

export interface AgentStatusInfo {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  activity: string;
  accent: string;
}

/** 初始 Agent 编队（主管 + 专项 Agent）。 */
export function initialAgents(): AgentStatusInfo[] {
  return seedAgents.map((a) => ({ ...a }));
}

/** agent_update: { type, agentId, status?, activity? } */
export function agentReducer(list: AgentStatusInfo[], event: AgentEvent): AgentStatusInfo[] {
  if (event.type !== "agent_update") return list;
  const id = event.agentId as string;
  const status = event.status as AgentStatus | undefined;
  const activity = event.activity as string | undefined;
  return list.map((a) =>
    a.id === id
      ? {
          ...a,
          status: status ?? a.status,
          activity: activity ?? a.activity,
        }
      : a,
  );
}
