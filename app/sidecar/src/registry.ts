// 会话注册表：管理运行中的 AgentSessionWrapper 生命周期与并发启动锁。

import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  initTheme,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { RpcSessionStartOptions } from "./types";
import { AgentSessionWrapper } from "./wrapper";

const registry = new Map<string, AgentSessionWrapper>();
const locks = new Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>>();

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return registry.get(sessionId);
}

export function getRunningRpcSessionIds(): string[] {
  const ids: string[] = [];
  for (const [sessionId, session] of registry) {
    if (session.isRunning()) ids.push(session.sessionId || sessionId);
  }
  return ids;
}

export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  options: RpcSessionStartOptions = {},
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const { toolNames, initialModel, thinkingLevel } = options;

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) return { session: existing, realSessionId: sessionId };

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    initTheme();
    const agentDir = getAgentDir();

    const sessionManager = sessionFile
      ? SessionManager.open(sessionFile)
      : SessionManager.create(cwd);

    let toolsOption: string[] | undefined;
    if (toolNames !== undefined) {
      toolsOption = toolNames.length === 0 ? [] : undefined;
    }

    const services = await createAgentSessionServices({ cwd, agentDir });

    const initialModelObj = initialModel
      ? await services.modelRuntime.getModel(initialModel.provider, initialModel.modelId)
      : undefined;

    const { session: inner } = await createAgentSessionFromServices({
      services,
      sessionManager,
      ...(initialModelObj ? { model: initialModelObj } : {}),
      ...(thinkingLevel ? { thinkingLevel: thinkingLevel as never } : {}),
      ...(toolsOption !== undefined ? { tools: toolsOption } : {}),
    });

    const wrapper = new AgentSessionWrapper(inner);
    if (toolNames?.length === 0) {
      wrapper.setForceEmptySystemPrompt(true);
    }
    wrapper.start();

    const realSessionId = inner.sessionId;
    wrapper.onDestroy(() => registry.delete(realSessionId));
    registry.set(realSessionId, wrapper);
    wrapper.beginExtensionBinding();

    return { session: wrapper, realSessionId };
  })().finally(() => {
    locks.delete(sessionId);
  });

  locks.set(sessionId, starting);
  return starting;
}

export function destroyAllSessions(): void {
  for (const s of [...registry.values()]) s.destroy();
  registry.clear();
}
