/* 单个组件工具覆盖读取、更新和显示；工具结果保持简短，渲染由应用负责。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Type, StringEnum } from "@earendil-works/pi-ai";
import { defineTool } from "./sdk.js";
import { applicationComponents, type ComponentClient, type ComponentPatch } from "./component-client.js";

export function nativeComponentTools(client: ComponentClient | undefined = applicationComponents()) {
  if (!client) return [];
  return [defineTool({
    name: "app_component", label: "应用组件", executionMode: "sequential",
    description: "读取、更新或打开应用组件。writing 为文稿，patch 支持 name/body；resources 为资源，支持 view（文件/图片/视频/结果）及 files（name/size 数组，只含元数据）。open 可带 patch 一步更新并打开。Rust 校验并通知现有组件渲染；不执行任意 HTML、脚本或 URL。",
    promptSnippet: "通过 read/patch/open/close 与应用文稿、资源组件交互。",
    promptGuidelines: ["修改已有文稿前先用 app_component read 查看，保留工程师原有内容。app_component open 用于需要展示组件的任务；不要重复在聊天中输出完整工具结果。"],
    parameters: Type.Object({
      component: StringEnum(["writing", "resources"] as const),
      action: StringEnum(["read", "patch", "open", "close"] as const),
      patch: Type.Optional(Type.Object({}, { additionalProperties: true, description: "patch 操作必填；open 时可选；其他操作不接受。字段沿用组件契约。" })),
    }, { additionalProperties: false }),
    async execute(_id, { component, action, patch }, signal) {
      if (signal?.aborted) throw new Error("组件操作已取消");
      if (action === "patch" && !patch) throw new Error("patch 操作需要 patch 字段");
      if ((action === "read" || action === "close") && patch) throw new Error("该操作不接受 patch 字段");
      const changes = patch as ComponentPatch | undefined;
      const snapshot = action === "patch" ? await client.patch(component, changes!)
        : action === "open" ? await client.open(component, changes) : await client[action](component);
      const summary = { component, action, ...(snapshot ? { revision: snapshot.revision } : {}) };
      const text = JSON.stringify(action === "read" ? snapshot : summary);
      return { content: [{ type: "text" as const, text: text.length > 32000 ? `${text.slice(0, 32000)}\n[内容已截断，完整快照可通过组件 SDK 读取]` : text }], details: summary };
    },
  })];
}
