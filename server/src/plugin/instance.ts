// 全局插件注册表单例：server 各处（入口/会话包装/任务运行时）共用同一实例。

import { PluginRegistry } from "./registry.js";
import { builtinPlugins } from "../plugins/index.js";

let registry: PluginRegistry | undefined;

export function getPluginRegistry(): PluginRegistry {
  if (!registry) {
    registry = new PluginRegistry(builtinPlugins);
  }
  return registry;
}
