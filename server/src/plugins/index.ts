// 内置插件清单（静态注册）。第一版只有 memory 插件。
// 新增内置插件时在此追加；动态加载（目录扫描）不在第一版范围。

import { memoryPlugin } from "./memory/index.js";
import type { YunfengPlugin } from "../plugin/types.js";

export const builtinPlugins: YunfengPlugin[] = [memoryPlugin];
