// 会话管理：进程内嵌入 pi SDK 的 AgentSession（与 pi CLI 同源）。
// 借鉴 pi-web 的 rpc-manager.ts 设计，去掉浏览器特有（自定义 UI、OAuth 等）部分。

import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  initTheme,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { existsSync, writeFileSync } from "node:fs";
import type { AgentEvent, EventListener, RpcSessionStartOptions } from "./types";
import { invalidateSessionList } from "./sessions";

// ---------------------------------------------------------------------------
// AgentSessionWrapper
// ---------------------------------------------------------------------------

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private promptRunning = false;
  private unsubscribe: (() => void) | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private _alive = true;
  private forceEmptySystemPrompt = false;

  constructor(public readonly inner: AgentSession) {}

  get sessionId(): string {
    return this.inner.sessionId;
  }

  get sessionFile(): string {
    return this.inner.sessionFile ?? "";
  }

  get cwd(): string {
    return this.inner.sessionManager.getCwd();
  }

  isAlive(): boolean {
    return this._alive;
  }

  isRunning(): boolean {
    return (
      this._alive &&
      (this.promptRunning || this.inner.isStreaming || this.inner.isCompacting || this.inner.isBashRunning)
    );
  }

  start(): void {
    this.unsubscribe = this.inner.subscribe((event: AgentSessionEvent) => {
      if (event.type === "agent_end") invalidateSessionList();
      this.emit(event as AgentEvent);
    });
  }

  setForceEmptySystemPrompt(force: boolean): void {
    this.forceEmptySystemPrompt = force;
    this.applyForcedEmptySystemPrompt();
  }

  beginExtensionBinding(): void {
    void this.bindExtensions().catch((err: unknown) => {
      console.error("[sidecar] failed to dispatch session_start to extensions:", err instanceof Error ? err.message : err);
    });
  }

  private async bindExtensions(): Promise<void> {
    if (typeof this.inner.bindExtensions === "function") {
      await this.inner.bindExtensions({
        uiContext: this.createMinimalUiContext() as never,
        mode: "rpc",
        commandContextActions: {
          waitForIdle: async () => {
            await this.inner.agent.waitForIdle();
          },
          newSession: async () => ({ cancelled: true }),
          fork: async () => ({ cancelled: true }),
          navigateTree: async (targetId: string, options?: { summarize?: boolean }) => {
            const result = await this.inner.navigateTree(targetId, { summarize: options?.summarize });
            return { cancelled: result.cancelled };
          },
          switchSession: async () => ({ cancelled: true }),
          reload: async () => {
            await this.inner.reload();
          },
        },
        onError: (error: { extensionPath: string; event: string; error: string }) => {
          this.emit({
            type: "extension_error",
            extensionPath: error.extensionPath,
            event: error.event,
            error: error.error,
          });
        },
      });
    }
  }

  private applyForcedEmptySystemPrompt(): void {
    if (this.forceEmptySystemPrompt && this.inner.agent.state) {
      this.inner.agent.state.systemPrompt = "";
    }
  }

  private emit(event: AgentEvent): void {
    for (const l of this.listeners) l(event);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    const type = command.type as string;

    switch (type) {
      case "prompt": {
        if (this.inner.isBashRunning) {
          throw new Error("Cannot send a prompt while a shell command is running");
        }
        const images = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        const streamingBehavior = command.streamingBehavior as "steer" | "followUp" | undefined;
        this.promptRunning = true;
        this.inner
          .prompt(command.message as string, {
            ...(images?.length ? { images } : {}),
            ...(streamingBehavior ? { streamingBehavior } : {}),
            source: "rpc",
          })
          .then(() => {
            this.promptRunning = false;
            if (!streamingBehavior) this.emit({ type: "prompt_done" });
          })
          .catch((error: unknown) => {
            this.promptRunning = false;
            invalidateSessionList();
            this.emit({
              type: "prompt_error",
              errorMessage: error instanceof Error ? error.message : String(error),
            });
            if (!streamingBehavior) this.emit({ type: "prompt_done" });
          });
        return null;
      }

      case "abort":
        await this.inner.abort();
        return null;

      case "get_state": {
        const model = this.inner.model;
        const contextUsage = this.inner.getContextUsage();
        return {
          sessionId: this.inner.sessionId,
          sessionFile: this.inner.sessionFile ?? "",
          isStreaming: this.inner.isStreaming,
          isPromptRunning: this.promptRunning,
          isBashRunning: this.inner.isBashRunning,
          isCompacting: this.inner.isCompacting,
          autoCompactionEnabled: this.inner.autoCompactionEnabled,
          autoRetryEnabled: this.inner.autoRetryEnabled,
          model: model ? { id: model.id, provider: model.provider } : undefined,
          messageCount: 0,
          pendingMessageCount: this.inner.pendingMessageCount,
          queuedMessages: {
            steering: [...this.inner.getSteeringMessages()],
            followUp: [...this.inner.getFollowUpMessages()],
          },
          contextUsage: contextUsage
            ? { percent: contextUsage.percent, contextWindow: contextUsage.contextWindow, tokens: contextUsage.tokens }
            : null,
          systemPrompt: this.inner.agent.state?.systemPrompt ?? "",
          thinkingLevel: this.inner.agent.state?.thinkingLevel ?? "off",
        };
      }

      case "set_model": {
        const { provider, modelId } = command as { provider: string; modelId: string };
        const model = await this.inner.modelRuntime.getModel(provider, modelId);
        if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
        await this.inner.setModel(model);
        invalidateSessionList();
        return { id: model.id, provider: model.provider };
      }

      case "fork": {
        if (this.inner.isBashRunning) {
          throw new Error("Cannot fork while a shell command is running");
        }
        const entryId = command.entryId as string;
        const sessionManager = this.inner.sessionManager;
        const currentSessionFile = this.inner.sessionFile;

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
        this.destroy();
        return { cancelled: false, newSessionId };
      }

      case "set_thinking_level": {
        const level = command.level as never;
        this.inner.setThinkingLevel(level);
        invalidateSessionList();
        return null;
      }

      case "compact":
        try {
          return await this.inner.compact(command.customInstructions as string | undefined);
        } finally {
          invalidateSessionList();
        }

      case "set_session_name": {
        const name = (command.name as string | undefined)?.trim();
        if (!name) throw new Error("Session name cannot be empty");
        this.inner.setSessionName(name);
        invalidateSessionList();
        return null;
      }

      case "get_session_stats":
        return {
          ...this.inner.getSessionStats(),
          sessionName: this.inner.sessionManager.getSessionName(),
        };

      case "get_last_assistant_text":
        return { text: this.inner.getLastAssistantText() ?? "" };

      case "set_auto_compaction":
        this.inner.setAutoCompactionEnabled(command.enabled as boolean);
        return null;

      case "clear_queue":
        return this.inner.clearQueue();

      case "steer": {
        const steerImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        await this.inner.steer(command.message as string, steerImages?.length ? steerImages : undefined);
        return null;
      }

      case "follow_up": {
        const followImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        await this.inner.followUp(command.message as string, followImages?.length ? followImages : undefined);
        return null;
      }

      case "get_tools": {
        const all = this.inner.getAllTools();
        const active = new Set<string>(this.inner.getActiveToolNames());
        return all.map((t) => ({
          name: t.name,
          description: t.description,
          active: active.has(t.name),
        }));
      }

      case "get_commands": {
        const commands: SlashCommandInfo[] = [];
        for (const registered of this.inner.extensionRunner.getRegisteredCommands()) {
          commands.push({
            name: registered.invocationName,
            description: registered.description,
            source: "extension",
            sourceInfo: registered.sourceInfo,
          });
        }
        for (const template of this.inner.promptTemplates) {
          commands.push({
            name: template.name,
            description: template.description,
            source: "prompt",
            sourceInfo: template.sourceInfo,
          });
        }
        for (const skill of this.inner.resourceLoader.getSkills().skills) {
          commands.push({
            name: `skill:${skill.name}`,
            description: skill.description,
            source: "skill",
            sourceInfo: skill.sourceInfo,
          });
        }
        return { commands };
      }

      case "set_tools": {
        const toolNames = command.toolNames as string[];
        this.setForceEmptySystemPrompt(toolNames.length === 0);
        this.inner.setActiveToolsByName(toolNames);
        this.applyForcedEmptySystemPrompt();
        return null;
      }

      case "reload": {
        await this.inner.reload();
        this.applyForcedEmptySystemPrompt();
        return { success: true };
      }

      case "bash": {
        if (this.promptRunning || this.inner.isStreaming || this.inner.isCompacting || this.inner.isBashRunning) {
          throw new Error("Cannot run a shell command while the session is busy");
        }
        const execution = this.inner.executeBash(
          command.command as string,
          undefined,
          { excludeFromContext: command.excludeFromContext as boolean | undefined },
        );
        try {
          const result = await execution;
          this.persistBashOnlySession();
          return result;
        } finally {
          invalidateSessionList();
        }
      }

      case "abort_bash":
        this.inner.abortBash();
        return null;

      default:
        throw new Error(`Unsupported command: ${type}`);
    }
  }

  private persistBashOnlySession(): void {
    const manager = this.inner.sessionManager;
    const sessionFile = manager.getSessionFile();
    if (!sessionFile || existsSync(sessionFile)) return;
    const header = manager.getHeader();
    if (!header) return;
    const content =
      [header, ...manager.getEntries()].map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(sessionFile, content, { encoding: "utf8", flag: "wx" });
    (manager as unknown as { flushed: boolean }).flushed = true;
  }

  destroy(): void {
    if (!this._alive) return;
    this._alive = false;
    if (this.inner.isBashRunning) this.inner.abortBash();
    this.unsubscribe?.();
    this.onDestroyCallback?.();
  }

  private createMinimalUiContext(): unknown {
    return {
      select: () => Promise.resolve(undefined),
      confirm: () => Promise.resolve(false),
      input: () => Promise.resolve(undefined),
      editor: () => Promise.resolve(undefined),
      notify: () => {},
      onTerminalInput: () => () => {},
      setStatus: () => {},
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setWidget: () => {},
      setFooter: () => {},
      setHeader: () => {},
      setTitle: () => {},
      custom: () => Promise.resolve(undefined),
      pasteToEditor: () => {},
      setEditorText: () => {},
      getEditorText: () => "",
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: "Theme switching is not supported" }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
    };
  }
}

// ---------------------------------------------------------------------------
// 会话注册表
// ---------------------------------------------------------------------------

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
