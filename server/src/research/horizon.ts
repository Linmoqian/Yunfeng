/* 视界统一读取入口：依赖注入现有模块，返回有界投影，不复制业务状态。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { toolArbiter } from "./tool-arbiter.js";
export const horizonDomains = ["training", "literature", "writing", "ideas"] as const;
export type HorizonDomain = typeof horizonDomains[number];
export interface HorizonView { summary: string; revision?: number; data?: unknown }
export type HorizonPorts = Partial<Record<HorizonDomain, () => Promise<HorizonView>>>;
/** 第一版只读取现有模块；缺少适配明确不可用，副作用仍由现有 execute 步骤完成。 */
export function createHorizon(taskId: string, ports: HorizonPorts) {
  return { async read(domain: HorizonDomain, signal?: AbortSignal) {
    if (!horizonDomains.includes(domain)) throw new Error("视界类型无效");
    return toolArbiter.run({ tool: "horizon", resources: [{ key: `horizon:${taskId}:${domain}`, write: false }], signal }, async () => {
      const port = ports[domain];
      if (!port) return { domain, available: false, summary: "当前视界未接入" };
      const view = await port();
      if (JSON.stringify(view).length > 16000) throw new Error("视界结果超过上限，请缩小投影");
      return { domain, available: true, ...view };
    });
  } };
}
