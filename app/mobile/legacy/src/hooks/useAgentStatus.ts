// Agent 状态 hook：初始编队 + 接收 SSE agent_update 事件实时更新。

import { useCallback, useState } from "react";
import type { AgentEvent } from "@/lib/types";
import { agentReducer, initialAgents, type AgentStatusInfo } from "@/lib/agentEvents";

export interface AgentStatusPanel {
  agents: AgentStatusInfo[];
  applyEvent: (event: AgentEvent) => void;
}

export function useAgentStatus(): AgentStatusPanel {
  const [agents, setAgents] = useState<AgentStatusInfo[]>(initialAgents);

  const applyEvent = useCallback((event: AgentEvent) => {
    setAgents((prev) => agentReducer(prev, event));
  }, []);

  return { agents, applyEvent };
}
