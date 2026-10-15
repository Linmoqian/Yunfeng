/* Yunfeng 的 Pi SDK 适配入口：以 Lin 命名空间加载配置和项目资源。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import "../environment.js";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const sdkPackageDir = dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
const serverPackageDir = fileURLToPath(new URL("../../", import.meta.url));
const runtimeHome = process.env.YUNFENG_RUNTIME_HOME?.trim() || homedir();
const configuredAgentDir = process.env.YUNFENG_AGENT_DIR?.trim() || process.env.LIN_CODING_AGENT_DIR?.trim();
const agentDir = configuredAgentDir
  ? resolve(configuredAgentDir === "~" ? runtimeHome : configuredAgentDir.replace(/^~[/\\]/, `${runtimeHome}/`))
  : join(runtimeHome, ".lin", "agent");

// Pi 的 configDir 在首次模块加载时固定。用官方包元数据入口设置 Lin 品牌，
// 加载后恢复 SDK 资源根，主题和 HTML 导出仍使用原包资产。
process.env.LIN_CODING_AGENT_DIR = agentDir;
process.env.PI_PACKAGE_DIR = serverPackageDir;
const sdk = await (async () => {
  try {
    return await import("@earendil-works/pi-coding-agent");
  } finally {
    process.env.PI_PACKAGE_DIR = sdkPackageDir;
  }
})();
if (sdk.CONFIG_DIR_NAME !== ".lin") {
  throw new Error("Pi SDK 已在 Lin 适配层之前加载，拒绝使用非 .lin 配置目录");
}

export const {
  CONFIG_DIR_NAME,
  getAgentDir,
  createBashToolDefinition,
  createAgentSessionServices,
  createAgentSessionFromServices,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
  ModelRuntime,
  buildContextEntries,
  buildSessionContext,
  resolveModelScopeWithDiagnostics,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  initTheme,
} = sdk;
export type {
  AgentSession,
  AgentSessionEvent,
  SlashCommandInfo,
  ScopedModel,
} from "@earendil-works/pi-coding-agent";

export type SettingsManager = import("@earendil-works/pi-coding-agent").SettingsManager;
export type ModelRuntime = import("@earendil-works/pi-coding-agent").ModelRuntime;
