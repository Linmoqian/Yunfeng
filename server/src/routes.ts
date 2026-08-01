// HTTP 路由处理器：复刻 pi-web 的 API 面（agent/sessions/models/files/git/cwd/auth/home）。

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { join, dirname } from "node:path";
import {
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  getRpcSession,
  getRunningRpcSessionIds,
  startRpcSession,
  subscribeRunningSessions,
  hasBusyRpcSessionForCwd,
  destroyRpcSessionsForCwd,
} from "./rpc-manager.js";
import {
  buildSessionContext,
  getSessionEntries,
  invalidateSessionListCache,
  invalidateSessionPathCache,
  listAllSessions,
  readSessionHeader,
  resolveSessionPath,
} from "./session-reader.js";
import { loadModelsWithCache, withModelRuntimeError } from "./models-cache.js";
import { resolveVisibleModels, selectInitialModelScope } from "./model-scope.js";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { getProjectTrustStatus, trustProject } from "./project-trust.js";
import {
  getAllowedFileRoots,
  isExistingFilePathAllowed,
  isFilePathAllowed,
  isWindowsAbsolutePath,
} from "./file-access.js";
import { getGitFileDiff, getGitStatus } from "./git-changes.js";
import {
  getBrowseStartDirectory,
  getParentDirectory,
  listDirectories,
  resolveDirectory,
} from "./directory-browser.js";
import { sessionPathKey } from "./session-path.js";
import type { ModelsData } from "./types.js";

// ----------------------------------------------------------------------------
// 工具
// ----------------------------------------------------------------------------

export interface RouteResult {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  stream?: (write: (chunk: string) => void, close: () => void) => void;
}

export function json(data: unknown, status = 200, headers?: Record<string, string>): RouteResult {
  return { status, headers, body: data };
}

export function jsonError(message: string, status = 500): RouteResult {
  return json({ error: message }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function parseThinkingLevel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && THINKING_LEVELS.has(value)) return value;
  throw new Error(`Invalid thinking level: ${String(value)}`);
}

// ----------------------------------------------------------------------------
// 文件 API（list/read/meta/preview/watch/download）
// ----------------------------------------------------------------------------

const IGNORED_NAMES = new Set([
  "node_modules", ".git", ".next", "dist", "build", "__pycache__",
  ".turbo", ".cache", "coverage", ".pytest_cache", ".mypy_cache",
  "target", "vendor", ".DS_Store",
]);

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", py: "python", rb: "ruby",
  go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
  html: "html", htm: "html", css: "css", scss: "css", less: "css",
  json: "json", jsonl: "json", yaml: "yaml", yml: "yaml",
  toml: "toml", xml: "xml", md: "markdown", mdx: "markdown",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  sql: "sql", graphql: "graphql", gql: "graphql",
  dockerfile: "dockerfile", tf: "hcl", hcl: "hcl",
  env: "bash", gitignore: "bash", txt: "text",
};

function getLanguage(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  if (base === ".env" || base.startsWith(".env.")) return "bash";
  if (base === "makefile" || base === "gnumakefile") return "makefile";
  const ext = base.split(".").pop() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? "text";
}

function filePathFromSegments(segments: string[]): string {
  const joined = segments.join("/");
  if (isWindowsAbsolutePath(joined)) return joined;
  return "/" + joined.replace(/^\/+/, "");
}

const FILE_REQUEST_TYPES = new Set(["list", "read", "download", "meta", "preview", "watch"]);

const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;

async function validateFileAccess(filePath: string): Promise<{ ok: boolean; status: number; message: string }> {
  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(filePath, allowedRoots)) {
    return { ok: false, status: 403, message: "Access denied" };
  }
  if (!isExistingFilePathAllowed(filePath, allowedRoots)) {
    return { ok: false, status: 403, message: "Access denied" };
  }
  return { ok: true, status: 200, message: "" };
}

export async function handleFilesGet(segments: string[], query: URLSearchParams): Promise<RouteResult> {
  const filePath = filePathFromSegments(segments);
  const rawType = query.get("type") ?? "list";
  if (!FILE_REQUEST_TYPES.has(rawType)) {
    return jsonError("Invalid file request type", 400);
  }

  const access = await validateFileAccess(filePath);
  if (!access.ok) return jsonError(access.message, access.status);

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return jsonError("Not found", 404);
  }

  if (rawType === "read") {
    if (!stat.isFile()) return jsonError("Not a file", 400);
    if (stat.size > TEXT_PREVIEW_MAX_BYTES) {
      return jsonError("File too large for preview (>256KB)", 413);
    }
    const content = readFileSync(filePath, "utf8");
    return json({ content, language: getLanguage(filePath), size: stat.size });
  }

  if (rawType === "meta") {
    if (!stat.isFile()) return jsonError("Not a file", 400);
    return json({ size: stat.size, language: getLanguage(filePath), mime: "text/plain", previewKind: null });
  }

  if (rawType === "download") {
    if (!stat.isFile()) return jsonError("Not a file", 400);
    const content = readFileSync(filePath);
    return {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`,
      },
      stream: (write, close) => {
        write(content.toString("base64"));
        close();
      },
    };
  }

  if (rawType === "list") {
    if (!stat.isDirectory()) return jsonError("Not a directory", 400);
    const entries = readdirSync(filePath, { withFileTypes: true })
      .filter((d) => !IGNORED_NAMES.has(d.name))
      .map((d) => {
        const isDir = d.isDirectory();
        return { name: d.name, isDir, size: 0, modified: "" };
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return json({ entries, path: filePath });
  }

  return jsonError("Preview not available for this file type", 400);
}

// ----------------------------------------------------------------------------
// Agent RPC
// ----------------------------------------------------------------------------

export async function handleAgentNew(body: Record<string, unknown>): Promise<RouteResult> {
  const { cwd, ...command } = body;
  if (!cwd || typeof cwd !== "string") return jsonError("cwd is required", 400);
  if (!existsSync(cwd)) return jsonError(`Directory does not exist: ${cwd}`, 400);

  const { provider, modelId, toolNames, thinkingLevel, ...promptCommand } = command as {
    provider?: string;
    modelId?: string;
    toolNames?: string[];
    thinkingLevel?: unknown;
    [key: string]: unknown;
  };
  if ((provider && !modelId) || (!provider && modelId)) {
    return jsonError("provider and modelId must be provided together", 400);
  }
  let explicitThinkingLevel: string | undefined;
  try {
    explicitThinkingLevel = parseThinkingLevel(thinkingLevel);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }

  const tempKey = `__new__${randomUUID()}`;
  try {
    const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, {
      ...(toolNames ? { toolNames } : {}),
      ...(provider && modelId ? { initialModel: { provider, modelId } } : {}),
      ...(explicitThinkingLevel ? { thinkingLevel: explicitThinkingLevel } : {}),
    });

    invalidateSessionListCache();

    const state = await session.send({ type: "get_state" }) as {
      model?: { id: string; provider: string };
      thinkingLevel?: string;
    };

    if (promptCommand.type === "ensure_session") {
      return json({
        success: true,
        sessionId: realSessionId,
        data: null,
        model: state.model ? { provider: state.model.provider, modelId: state.model.id } : null,
        thinkingLevel: state.thinkingLevel,
      });
    }

    const result = await session.send(promptCommand);

    return json({
      success: true,
      sessionId: realSessionId,
      data: result,
      model: state.model ? { provider: state.model.provider, modelId: state.model.id } : null,
      thinkingLevel: state.thinkingLevel,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleAgentCommand(id: string, body: Record<string, unknown>): Promise<RouteResult> {
  try {
    const existing = getRpcSession(id);
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      return json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) return jsonError("Session not found", 404);

    const cwd = readSessionHeader(filePath)?.cwd ?? process.cwd();
    const { session } = await startRpcSession(id, filePath, cwd);
    const result = await session.send(body);
    return json({ success: true, data: result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleAgentGet(id: string): Promise<RouteResult> {
  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return json({ running: false });
    }
    const state = await session.send({ type: "get_state" });
    return json({ running: true, state });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function handleAgentEvents(id: string): RouteResult {
  const session = getRpcSession(id);
  if (!session?.isAlive()) {
    return jsonError("Session not running", 404);
  }

  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    stream: (write, close) => {
      write(`data: ${JSON.stringify({ type: "connected", sessionId: id })}\n\n`);
      const unsubscribe = session.onEvent((event) => {
        write(`data: ${JSON.stringify(event)}\n\n`);
      });
      const heartbeat = setInterval(() => {
        write(":\n\n");
      }, 30_000);
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        close();
      };
      // 返回清理函数由 index.ts 在连接断开时调用
      (cleanup as unknown as { run: () => void }).run = cleanup;
      (session as unknown as Record<string, unknown>).__eventCleanup = cleanup;
    },
  };
}

export function handleRunningEvents(): RouteResult {
  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    stream: (write, close) => {
      const unsubscribe = subscribeRunningSessions((ids) => {
        write(`data: ${JSON.stringify({ type: "running", runningSessionIds: ids })}\n\n`);
      });
      write(`data: ${JSON.stringify({ type: "running", runningSessionIds: getRunningRpcSessionIds() })}\n\n`);
      const heartbeat = setInterval(() => {
        write(":\n\n");
      }, 30_000);
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        close();
      };
      (cleanup as unknown as { run: () => void }).run = cleanup;
    },
  };
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

export async function handleSessionsList(): Promise<RouteResult> {
  try {
    const sessions = await listAllSessions();
    return json({ sessions, runningSessionIds: getRunningRpcSessionIds() });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleSessionGet(id: string, query: URLSearchParams): Promise<RouteResult> {
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return jsonError("Session not found", 404);

    const sm = SessionManager.open(filePath);
    const entries = sm.getEntries() as never;
    const leafId = sm.getLeafId();
    const context = buildSessionContext(entries, leafId, {
      deferThinking: query.has("deferThinking"),
      deferToolResultImages: query.has("deferMedia"),
    });
    const header = sm.getHeader();
    let modified = header?.timestamp ?? new Date().toISOString();
    try { modified = statSync(filePath).mtime.toISOString(); } catch { /* ignore */ }
    const parentSessionId = header?.parentSession ? (await resolveSessionPath(path.basename(header.parentSession))) ?? undefined : undefined;
    const info = header ? {
      path: filePath,
      id: header.id,
      cwd: header.cwd ?? "",
      name: sm.getSessionName(),
      created: header.timestamp,
      modified,
      messageCount: context.messages.length,
      firstMessage: context.messages.find((m) => m.role === "user")
        ? (() => {
            const msg = context.messages.find((m) => m.role === "user")!;
            const c = (msg as { content: unknown }).content;
            return typeof c === "string" ? c : (Array.isArray(c) ? (c.find((b: { type: string }) => b.type === "text") as { text: string } | undefined)?.text ?? "" : "") || "(no messages)";
          })()
        : "(no messages)",
      parentSessionId,
    } : null;

    return json({ sessionId: id, filePath, info, leafId, context });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleSessionPatch(id: string, body: Record<string, unknown>): Promise<RouteResult> {
  try {
    const { name } = body as { name?: string };
    if (typeof name !== "string") return jsonError("name is required", 400);
    const filePath = await resolveSessionPath(id);
    if (!filePath) return jsonError("Session not found", 404);
    const sm = SessionManager.open(filePath);
    sm.appendSessionInfo(name.trim());
    invalidateSessionListCache();
    return json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleSessionDelete(id: string): Promise<RouteResult> {
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return jsonError("Session not found", 404);

    const parentSessionPath = readSessionHeader(filePath)?.parentSession;
    const targetPathKey = sessionPathKey(filePath);
    const dir = dirname(filePath);
    try {
      const files = readdirSync(dir).filter(
        (file) => file.endsWith(".jsonl") && sessionPathKey(join(dir, file)) !== targetPathKey,
      );
      for (const file of files) {
        const childPath = join(dir, file);
        try {
          const content = readFileSync(childPath, "utf8");
          const lines = content.split("\n");
          const header = JSON.parse(lines[0]) as { type?: string; parentSession?: string };
          if (header.type === "session" && header.parentSession && sessionPathKey(header.parentSession) === targetPathKey) {
            header.parentSession = parentSessionPath;
            lines[0] = JSON.stringify(header);
            writeFileSync(childPath, lines.join("\n"));
          }
        } catch { /* skip malformed */ }
      }
    } catch { /* skip if dir unreadable */ }

    getRpcSession(id)?.destroy();
    unlinkSync(filePath);
    invalidateSessionPathCache(id);
    invalidateSessionListCache();
    return json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleSessionContext(id: string, query: URLSearchParams): Promise<RouteResult> {
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return jsonError("Session not found", 404);
    const leafId = query.get("leafId") ?? undefined;
    const sm = SessionManager.open(filePath);
    const context = buildSessionContext(sm.getEntries() as never, leafId, {
      deferThinking: query.has("deferThinking"),
      deferToolResultImages: query.has("deferMedia"),
    });
    return json({ context });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleSessionState(id: string): Promise<RouteResult> {
  try {
    if (!await resolveSessionPath(id)) return jsonError("Session not found", 404);
    const rpc = getRpcSession(id);
    if (!rpc?.isAlive()) return json({ running: false });
    const state = await rpc.send({ type: "get_state" });
    return json({ running: true, state });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleSessionThinking(id: string, entryId: string, query: URLSearchParams): Promise<RouteResult> {
  const blockIndexParam = query.get("blockIndex");
  const blockIndex = blockIndexParam === null ? Number.NaN : Number(blockIndexParam);
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0) {
    return jsonError("Valid blockIndex is required", 400);
  }
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return jsonError("Session not found", 404);
    const entry = (getSessionEntries(filePath) as Array<Record<string, unknown>>).find((candidate) => candidate.id === entryId);
    if (!entry || entry.type !== "message" || (entry.message as { role?: string }).role !== "assistant") {
      return jsonError("Assistant message not found", 404);
    }
    const block = ((entry.message as { content?: Array<{ type?: string; thinking?: string }> }).content ?? [])[blockIndex];
    if (!block || block.type !== "thinking") return jsonError("Thinking block not found", 404);
    return json({ thinking: block.thinking });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

// ----------------------------------------------------------------------------
// Models
// ----------------------------------------------------------------------------

const modelNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareModelEntries(
  a: { id: string; name: string; provider: string },
  b: { id: string; name: string; provider: string },
): number {
  return modelNameCollator.compare(a.name || a.id, b.name || b.id)
    || modelNameCollator.compare(a.provider, b.provider)
    || modelNameCollator.compare(a.id, b.id);
}

async function loadModels(cwd: string): Promise<ModelsData> {
  const nameMap = new Map<string, string>();
  let modelList: { id: string; name: string; provider: string }[] = [];
  let defaultModel: { provider: string; modelId: string } | null = null;
  const thinkingLevels: Record<string, string[]> = {};
  const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};

  const agentDir = getAgentDir();
  const services = await createAgentSessionServices({ cwd, agentDir });
  const modelError = services.modelRuntime.getError();
  const settings: SettingsManager = services.settingsManager;
  const scope = await resolveVisibleModels(services.modelRuntime, settings.getEnabledModels());
  const { visible, thinkingLevelPins, warnings } = scope;
  modelList = visible.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
  })).sort(compareModelEntries);
  for (const m of visible) {
    const key = `${m.provider}:${m.id}`;
    nameMap.set(key, m.name);
    thinkingLevels[key] = getSupportedThinkingLevels(m);
    if (m.thinkingLevelMap) thinkingLevelMaps[key] = m.thinkingLevelMap;
  }

  const defaultProvider = settings.getDefaultProvider();
  const defaultModelId = settings.getDefaultModel();
  const initial = selectInitialModelScope(scope, {
    ...(defaultProvider && defaultModelId
      ? { defaultModel: { provider: defaultProvider, modelId: defaultModelId } }
      : {}),
  });
  if (initial.model) {
    defaultModel = { provider: initial.model.provider, modelId: initial.model.id };
  }

  return withModelRuntimeError(
    {
      models: Object.fromEntries(nameMap),
      modelList,
      defaultModel,
      thinkingLevels,
      thinkingLevelMaps,
      thinkingLevelPins,
      ...(warnings.length > 0 ? { modelScopeWarnings: warnings } : {}),
    },
    modelError,
  );
}

const EMPTY_MODELS: ModelsData = {
  models: {},
  modelList: [],
  defaultModel: null,
  thinkingLevels: {},
  thinkingLevelMaps: {},
  thinkingLevelPins: {},
};

export async function handleModelsGet(query: URLSearchParams): Promise<RouteResult> {
  const requestedCwd = query.get("cwd") || process.cwd();
  const cwd = path.resolve(requestedCwd);
  try {
    const cwdStat = statSync(cwd);
    if (!cwdStat.isDirectory()) return jsonError(`Not a directory: ${cwd}`, 400);
    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) return jsonError("Access denied", 403);
  } catch {
    return jsonError(`Directory does not exist: ${cwd}`, 400);
  }
  try {
    return json(await loadModelsWithCache(cwd, () => loadModels(cwd)));
  } catch {
    return json(EMPTY_MODELS);
  }
}

function getModelsPath(): string {
  return join(getAgentDir(), "models.json");
}

function readModelsJson(): Record<string, unknown> {
  const modelsPath = getModelsPath();
  if (!existsSync(modelsPath)) return { providers: {} };
  try {
    return JSON.parse(readFileSync(modelsPath, "utf8")) as Record<string, unknown>;
  } catch {
    return { providers: {} };
  }
}

export function handleModelsConfigGet(): RouteResult {
  return json(readModelsJson());
}

export function handleModelsConfigPut(body: Record<string, unknown>): RouteResult {
  try {
    const modelsPath = getModelsPath();
    const dir = dirname(modelsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(modelsPath, JSON.stringify(body, null, 2));
    return json({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

// ----------------------------------------------------------------------------
// Git
// ----------------------------------------------------------------------------

export async function handleGitStatus(query: URLSearchParams): Promise<RouteResult> {
  try {
    const cwd = query.get("cwd")?.trim() ?? "";
    if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
      return jsonError("cwd must be an absolute path", 400);
    }
    const allowedRoots = await getAllowedFileRoots();
    if (!isFilePathAllowed(cwd, allowedRoots)) return jsonError("Access denied", 403);
    let stat;
    try {
      stat = statSync(cwd);
    } catch {
      return jsonError("Directory not found", 404);
    }
    if (!stat.isDirectory()) return jsonError("Not a directory", 400);
    return json(await getGitStatus(cwd));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export async function handleGitDiff(query: URLSearchParams): Promise<RouteResult> {
  try {
    const cwd = query.get("cwd")?.trim() ?? "";
    const filePath = query.get("path")?.trim() ?? "";
    if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
      return jsonError("cwd must be an absolute path", 400);
    }
    if (!filePath || (!filePath.startsWith("/") && !isWindowsAbsolutePath(filePath))) {
      return jsonError("path must be an absolute path", 400);
    }
    const allowedRoots = await getAllowedFileRoots();
    if (!isFilePathAllowed(cwd, allowedRoots) || !isFilePathAllowed(filePath, allowedRoots)) {
      return jsonError("Access denied", 403);
    }
    return json(await getGitFileDiff(cwd, filePath));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

// ----------------------------------------------------------------------------
// CWD / Home
// ----------------------------------------------------------------------------

export async function handleCwdBrowse(query: URLSearchParams): Promise<RouteResult> {
  try {
    const requested = query.get("path")?.trim();
    const candidate = getBrowseStartDirectory(requested ?? undefined);
    let resolved: string;
    try {
      resolved = await resolveDirectory(candidate);
    } catch {
      return jsonError("Directory does not exist", 404);
    }
    const directoryStat = statSync(resolved);
    if (!directoryStat.isDirectory()) return jsonError("Path is not a directory", 400);
    const directories = await listDirectories(resolved);
    return json({ path: resolved, parentPath: getParentDirectory(resolved), directories });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

function normalizeCwd(cwd: string): string {
  if (cwd === "~") return homedir();
  if (cwd.startsWith("~/")) return path.resolve(homedir(), cwd.slice(2));
  return path.isAbsolute(cwd) ? cwd : path.resolve(cwd);
}

export function handleCwdValidate(body: Record<string, unknown>): RouteResult {
  try {
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    if (!cwd) return jsonError("Path is required", 400);
    const normalizedCwd = normalizeCwd(cwd);
    let stat;
    try {
      stat = statSync(normalizedCwd);
    } catch {
      return jsonError(`Directory does not exist: ${cwd}`, 400);
    }
    if (!stat.isDirectory()) return jsonError(`Path is not a directory: ${cwd}`, 400);
    return json({ success: true, cwd: normalizedCwd });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function handleDefaultCwd(): RouteResult {
  try {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const dir = join(homedir(), `pi-cwd-${date}`);
    mkdirSync(dir, { recursive: true });
    return json({ cwd: dir });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

export function handleHome(): RouteResult {
  return json({ home: homedir() });
}

// ----------------------------------------------------------------------------
// Project trust
// ----------------------------------------------------------------------------

export function handleProjectTrustGet(query: URLSearchParams): RouteResult {
  const cwd = query.get("cwd")?.trim() ?? "";
  if (!cwd) return jsonError("cwd required", 400);
  return json(getProjectTrustStatus(cwd, getAgentDir()));
}

export function handleProjectTrustPost(body: Record<string, unknown>): RouteResult {
  try {
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    if (!cwd) return jsonError("cwd required", 400);
    return json(trustProject(cwd, getAgentDir()));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}

// ----------------------------------------------------------------------------
// Skills（列表 + 切换 disableModelInvocation）
// ----------------------------------------------------------------------------

export async function handleSkillsGet(query: URLSearchParams): Promise<RouteResult> {
  const cwd = query.get("cwd");
  if (!cwd) return jsonError("cwd required", 400);
  try {
    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) return jsonError("Access denied", 403);

    const services = await createAgentSessionServices({ cwd, agentDir: getAgentDir() });
    const loader = services.resourceLoader;
    const skills = loader.getSkills().skills.map((skill) => ({
      name: skill.name,
      description: skill.description ?? "",
      filePath: "",
      baseDir: "",
      disableModelInvocation: false,
      sourceInfo: skill.sourceInfo ?? {},
    }));
    return json({ skills, diagnostics: [], projectResourcesLoaded: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}
