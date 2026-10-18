/* 活跃任务内复用 SDK 模型目录与设置，配置变化时重新加载，避免跨任务状态共享。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { ModelRuntime, SettingsManager } from "../agent/sdk.js";
import type { ResearchResources } from "./resources.js";

interface Environment { settings: SettingsManager; modelRuntime: ModelRuntime }
export class ResearchModelEnvironment {
  private cached?: Environment & { signature: string };
  constructor(private readonly cwd: string, private readonly agentDir: string) {}
  private async signature(): Promise<string> {
    const paths = [join(this.agentDir, "auth.json"), join(this.agentDir, "models.json"), join(this.agentDir, "models-store.json"), join(this.agentDir, "settings.json"), join(this.cwd, ".lin/settings.json")];
    const files = await Promise.all(paths.map(async (path) => {
      try {
        const info = await stat(path, { bigint: true });
        return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
      } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing"; throw error; }
    }));
    // 环境变量也可能供 SDK 解析模型凭据；只保留摘要，不缓存或输出环境正文。
    return createHash("sha256").update(files.join("|")).update(JSON.stringify(process.env)).digest("hex");
  }
  /** 每个阶段仍用独立无工具会话；仅复用模型目录，不复用对话或扩展实例。 */
  async get(signal: AbortSignal): Promise<Environment> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      signal.throwIfAborted();
      const signature = await this.signature();
      signal.throwIfAborted();
      if (this.cached?.signature === signature) return this.cached;
      this.cached = undefined;
      const settings = SettingsManager.create(this.cwd, this.agentDir);
      const modelRuntime = await ModelRuntime.create({ authPath: join(this.agentDir, "auth.json"), modelsPath: join(this.agentDir, "models.json"), signal });
      signal.throwIfAborted();
      // SDK 首次加载可能更新目录；读配置期间发生替换时不能给旧内容贴上新签名。
      if (signature !== await this.signature()) continue;
      signal.throwIfAborted();
      this.cached = { settings, modelRuntime, signature };
      return this.cached;
    }
    throw new Error("科研模型配置正在变更，请稍后继续");
  }
}

const environments = new WeakMap<ResearchResources, { cwd: string; agentDir: string; environment: ResearchModelEnvironment }>();
/** 同一任务的决策与执行共用环境；暂停后的新资源对象不会复用旧环境。 */
export function researchModelEnvironment(cwd: string, agentDir: string, resources: ResearchResources): ResearchModelEnvironment {
  let entry = environments.get(resources);
  if (!entry || entry.cwd !== cwd || entry.agentDir !== agentDir) {
    entry = { cwd, agentDir, environment: new ResearchModelEnvironment(cwd, agentDir) };
    environments.set(resources, entry);
  }
  return entry.environment;
}
