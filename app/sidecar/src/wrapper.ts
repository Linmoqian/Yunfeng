// 会话封装：包装 pi SDK 的 AgentSession，负责事件转发、生命周期与状态。
// 命令分发（send）委托给 commands.ts，本文件只保留会话本身的能力。

import { existsSync, writeFileSync } from "node:fs";
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AgentEvent, EventListener } from "./types";
import { invalidateSessionList } from "./sessions";
import { executeCommand } from "./commands";

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private unsubscribe: (() => void) | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private _alive = true;
  private forceEmptySystemPrompt = false;

  /** 命令处理器读写：prompt 进行中标记。 */
  promptRunning = false;

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

  /** 命令处理器调用：强制空 system prompt 生效。 */
  applyForcedEmptySystemPrompt(): void {
    if (this.forceEmptySystemPrompt && this.inner.agent.state) {
      this.inner.agent.state.systemPrompt = "";
    }
  }

  /** 命令处理器调用：向订阅者广播事件。 */
  emit(event: AgentEvent): void {
    for (const l of this.listeners) l(event);
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
    return executeCommand(this, command);
  }

  /** 命令处理器调用：bash 会话落盘。 */
  persistBashOnlySession(): void {
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

