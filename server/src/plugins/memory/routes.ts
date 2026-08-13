// 记忆插件 HTTP 路由：/memory 系列。
// 复用 routes.ts 的 RouteResult/json/jsonError 契约（通用错误风格）。

// 记忆插件 HTTP 路由：/memory 系列。
// 通用错误风格（与 routes.ts 的 json/jsonError 契约一致）；
// 为避免插件与 server 路由层循环依赖，此处内联 json/jsonError 的最小实现。

import type { RouteContext, RouteResult } from "../../plugin/types.js";
import type { MemoryService } from "./service.js";
import { isMemoryKind, type MemoryKind, type NewMemory } from "./types.js";

function json(data: unknown, status = 200): RouteResult {
  return { status, body: data };
}

function jsonError(message: string, status = 500): RouteResult {
  return json({ error: message }, status);
}

function parseKind(value: string | null): MemoryKind | undefined {
  if (value && isMemoryKind(value)) return value;
  return undefined;
}

export function memoryRoutes(service: MemoryService) {
  return {
    /** GET /memory 列出记忆；支持 q/kind/confidence/project 过滤。 */
    list(ctx: RouteContext): RouteResult {
      const memories = service.list({
        q: ctx.query.get("q")?.trim() || undefined,
        kind: parseKind(ctx.query.get("kind")),
        confidence: ctx.query.get("confidence") === "confirmed"
          ? "confirmed"
          : ctx.query.get("confidence") === "candidate"
            ? "candidate"
            : undefined,
        projectKey: ctx.query.get("project")?.trim() || undefined,
      });
      return json({ memories });
    },

    /** POST /memory 显式写入一条记忆（user_explicit → confirmed）。 */
    create(ctx: RouteContext): RouteResult {
      const kind = ctx.body.kind;
      const content = typeof ctx.body.content === "string" ? ctx.body.content.trim() : "";
      if (!isMemoryKind(kind) || !content) {
        return jsonError("kind 必须为 preference|project_fact|procedure|episode 且 content 不能为空", 400);
      }
      const scope = ctx.body.scope === "project" ? "project" : "global";
      const projectKey = ctx.body.projectKey;
      const topics = Array.isArray(ctx.body.topics)
        ? (ctx.body.topics as unknown[]).filter((t): t is string => typeof t === "string")
        : undefined;

      let input: NewMemory;
      if (kind === "procedure") {
        const steps = Array.isArray(ctx.body.steps)
          ? (ctx.body.steps as unknown[]).filter((s): s is string => typeof s === "string")
          : [];
        if (steps.length === 0) return jsonError("procedure 需要非空 steps", 400);
        input = { kind: "procedure", content, steps };
      } else if (kind === "episode") {
        const lesson = typeof ctx.body.lesson === "string" ? ctx.body.lesson.trim() : "";
        if (!lesson) return jsonError("episode 需要非空 lesson", 400);
        input = { kind: "episode", content, lesson };
      } else {
        input = { kind, content };
      }

      const memory = service.add(input, {
        source: "user_explicit",
        scope,
        projectKey: typeof projectKey === "string" && projectKey ? projectKey : undefined,
        topics,
      });
      return json({ memory }, 201);
    },

    /** PATCH /memory/:id 确认记忆。 */
    confirm(ctx: RouteContext): RouteResult {
      const id = idFromPath(ctx.path);
      if (!id) return jsonError("无效的记忆 id", 400);
      const memory = service.confirm(id);
      if (!memory) return jsonError("记忆不存在", 404);
      return json({ memory });
    },

    /** DELETE /memory/:id 遗忘记忆。 */
    forget(ctx: RouteContext): RouteResult {
      const id = idFromPath(ctx.path);
      if (!id) return jsonError("无效的记忆 id", 400);
      if (!service.forget(id)) return jsonError("记忆不存在", 404);
      return json({ ok: true });
    },
  };
}

function idFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}
