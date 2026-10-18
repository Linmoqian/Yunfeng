/* 显式资源加载器：隔离用户包配置，只加载选中 skill 与宿主内置事件扩展。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { DefaultResourceLoader, SettingsManager } from "../agent/sdk.js";
import { loadResearchSkills } from "./skills.js";
import type { PiResearchBridge } from "./hooks/pi-bridge.js";
export interface ResearchResources { skills?: readonly string[]; bridge?: PiResearchBridge }

/** 资源发现使用空的内存设置，避免 reload 解析用户配置的 npm/git 包或任意扩展。 */
export async function researchResources(cwd: string, agentDir: string, phase: string, contract: string, options: ResearchResources) {
  const selected = await loadResearchSkills(cwd, agentDir, options.skills ?? []);
  const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: SettingsManager.inMemory({ packages: [], extensions: [], skills: [], prompts: [], themes: [] }),
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: contract, appendSystemPrompt: [],
    ...(options.bridge ? { eventBus: options.bridge.eventBus, extensionFactories: [{ name: "yunfeng-research", factory: options.bridge.extension(phase) }] } : {}),
    skillsOverride: () => ({ skills: selected.skills, diagnostics: [] }), appendSystemPromptOverride: () => selected.prompts,
  });
  await loader.reload();
  if (loader.getExtensions().errors.length) throw new Error("科研内置事件扩展加载失败");
  return loader;
}
