// 命令分发：AgentSessionWrapper.send() 的处理器集合。
// 每个命令一个独立函数（≤50 行），由 executeCommand 按 type 分发。

import { SessionManager, type SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type { AgentSessionWrapper } from "./wrapper";
import { invalidateSessionList } from "./sessions";

type CommandHandler = (w: AgentSessionWrapper, command: Record<string, unknown>) => Promise<unknown>;

async function handlePrompt(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  if (w.inner.isBashRunning) {
    throw new Error("Cannot send a prompt while a shell command is running");
  }
  const images = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
  const streamingBehavior = command.streamingBehavior as "steer" | "followUp" | undefined;
  w.promptRunning = true;
  w.inner
    .prompt(command.message as string, {
      ...(images?.length ? { images } : {}),
      ...(streamingBehavior ? { streamingBehavior } : {}),
      source: "rpc",
    })
    .then(() => {
      w.promptRunning = false;
      if (!streamingBehavior) w.emit({ type: "prompt_done" });
    })
    .catch((error: unknown) => {
      w.promptRunning = false;
      invalidateSessionList();
      w.emit({
        type: "prompt_error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (!streamingBehavior) w.emit({ type: "prompt_done" });
    });
  return null;
}

async function handleAbort(w: AgentSessionWrapper): Promise<unknown> {
  await w.inner.abort();
  return null;
}

async function handleGetState(w: AgentSessionWrapper): Promise<unknown> {
  const model = w.inner.model;
  const contextUsage = w.inner.getContextUsage();
  return {
    sessionId: w.inner.sessionId,
    sessionFile: w.inner.sessionFile ?? "",
    isStreaming: w.inner.isStreaming,
    isPromptRunning: w.promptRunning,
    isBashRunning: w.inner.isBashRunning,
    isCompacting: w.inner.isCompacting,
    autoCompactionEnabled: w.inner.autoCompactionEnabled,
    autoRetryEnabled: w.inner.autoRetryEnabled,
    model: model ? { id: model.id, provider: model.provider } : undefined,
    messageCount: 0,
    pendingMessageCount: w.inner.pendingMessageCount,
    queuedMessages: {
      steering: [...w.inner.getSteeringMessages()],
      followUp: [...w.inner.getFollowUpMessages()],
    },
    contextUsage: contextUsage
      ? { percent: contextUsage.percent, contextWindow: contextUsage.contextWindow, tokens: contextUsage.tokens }
      : null,
    systemPrompt: w.inner.agent.state?.systemPrompt ?? "",
    thinkingLevel: w.inner.agent.state?.thinkingLevel ?? "off",
  };
}

async function handleSetModel(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  const { provider, modelId } = command as { provider: string; modelId: string };
  const model = await w.inner.modelRuntime.getModel(provider, modelId);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
  await w.inner.setModel(model);
  invalidateSessionList();
  return { id: model.id, provider: model.provider };
}

async function handleFork(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  if (w.inner.isBashRunning) {
    throw new Error("Cannot fork while a shell command is running");
  }
  const entryId = command.entryId as string;
  const sessionManager = w.inner.sessionManager;
  const currentSessionFile = w.inner.sessionFile;

  if (!sessionManager.isPersisted()) return { cancelled: true };
  if (!currentSessionFile) throw new Error("Persisted session is missing a session file");

  const entry = sessionManager.getEntry(entryId);
  if (!entry) throw new Error("Invalid entry ID for forking");

  const sessionDir = sessionManager.getSessionDir();
  let newSessionFile: string;

  if (!entry.parentId) {
    const newManager = SessionManager.create(sessionManager.getCwd(), sessionDir);
    newManager.newSession({ parentSession: currentSessionFile });
    newSessionFile = newManager.getSessionFile() as string;
  } else {
    const sourceManager = SessionManager.open(currentSessionFile, sessionDir);
    const forkedPath = sourceManager.createBranchedSession(entry.parentId);
    if (!forkedPath) throw new Error("Failed to create forked session");
    newSessionFile = forkedPath;
  }

  const newSessionId = SessionManager.open(newSessionFile, sessionDir).getSessionId();
  invalidateSessionList();
  w.destroy();
  return { cancelled: false, newSessionId };
}

async function handleSetThinkingLevel(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  const level = command.level as never;
  w.inner.setThinkingLevel(level);
  invalidateSessionList();
  return null;
}

async function handleCompact(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  try {
    return await w.inner.compact(command.customInstructions as string | undefined);
  } finally {
    invalidateSessionList();
  }
}

async function handleSetSessionName(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  const name = (command.name as string | undefined)?.trim();
  if (!name) throw new Error("Session name cannot be empty");
  w.inner.setSessionName(name);
  invalidateSessionList();
  return null;
}

async function handleGetSessionStats(w: AgentSessionWrapper): Promise<unknown> {
  return {
    ...w.inner.getSessionStats(),
    sessionName: w.inner.sessionManager.getSessionName(),
  };
}

async function handleGetLastAssistantText(w: AgentSessionWrapper): Promise<unknown> {
  return { text: w.inner.getLastAssistantText() ?? "" };
}

async function handleSetAutoCompaction(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  w.inner.setAutoCompactionEnabled(command.enabled as boolean);
  return null;
}

async function handleClearQueue(w: AgentSessionWrapper): Promise<unknown> {
  return w.inner.clearQueue();
}

async function handleSteer(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  const steerImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
  await w.inner.steer(command.message as string, steerImages?.length ? steerImages : undefined);
  return null;
}

async function handleFollowUp(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  const followImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
  await w.inner.followUp(command.message as string, followImages?.length ? followImages : undefined);
  return null;
}

async function handleGetTools(w: AgentSessionWrapper): Promise<unknown> {
  const all = w.inner.getAllTools();
  const active = new Set<string>(w.inner.getActiveToolNames());
  return all.map((t) => ({
    name: t.name,
    description: t.description,
    active: active.has(t.name),
  }));
}

async function handleGetCommands(w: AgentSessionWrapper): Promise<unknown> {
  const commands: SlashCommandInfo[] = [];
  for (const registered of w.inner.extensionRunner.getRegisteredCommands()) {
    commands.push({
      name: registered.invocationName,
      description: registered.description,
      source: "extension",
      sourceInfo: registered.sourceInfo,
    });
  }
  for (const template of w.inner.promptTemplates) {
    commands.push({
      name: template.name,
      description: template.description,
      source: "prompt",
      sourceInfo: template.sourceInfo,
    });
  }
  for (const skill of w.inner.resourceLoader.getSkills().skills) {
    commands.push({
      name: `skill:${skill.name}`,
      description: skill.description,
      source: "skill",
      sourceInfo: skill.sourceInfo,
    });
  }
  return { commands };
}

async function handleSetTools(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  const toolNames = command.toolNames as string[];
  w.setForceEmptySystemPrompt(toolNames.length === 0);
  w.inner.setActiveToolsByName(toolNames);
  w.applyForcedEmptySystemPrompt();
  return null;
}

async function handleReload(w: AgentSessionWrapper): Promise<unknown> {
  await w.inner.reload();
  w.applyForcedEmptySystemPrompt();
  return { success: true };
}

async function handleBash(w: AgentSessionWrapper, command: Record<string, unknown>): Promise<unknown> {
  if (w.promptRunning || w.inner.isStreaming || w.inner.isCompacting || w.inner.isBashRunning) {
    throw new Error("Cannot run a shell command while the session is busy");
  }
  const execution = w.inner.executeBash(
    command.command as string,
    undefined,
    { excludeFromContext: command.excludeFromContext as boolean | undefined },
  );
  try {
    const result = await execution;
    w.persistBashOnlySession();
    return result;
  } finally {
    invalidateSessionList();
  }
}

async function handleAbortBash(w: AgentSessionWrapper): Promise<unknown> {
  w.inner.abortBash();
  return null;
}

const handlers: Record<string, CommandHandler> = {
  prompt: handlePrompt,
  abort: handleAbort,
  get_state: handleGetState,
  set_model: handleSetModel,
  fork: handleFork,
  set_thinking_level: handleSetThinkingLevel,
  compact: handleCompact,
  set_session_name: handleSetSessionName,
  get_session_stats: handleGetSessionStats,
  get_last_assistant_text: handleGetLastAssistantText,
  set_auto_compaction: handleSetAutoCompaction,
  clear_queue: handleClearQueue,
  steer: handleSteer,
  follow_up: handleFollowUp,
  get_tools: handleGetTools,
  get_commands: handleGetCommands,
  set_tools: handleSetTools,
  reload: handleReload,
  bash: handleBash,
  abort_bash: handleAbortBash,
};

export async function executeCommand(
  w: AgentSessionWrapper,
  command: Record<string, unknown>,
): Promise<unknown> {
  const handler = handlers[command.type as string];
  if (!handler) throw new Error(`Unsupported command: ${String(command.type)}`);
  return handler(w, command);
}
