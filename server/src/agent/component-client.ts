/* Agent 与程序的组件 SDK；与前端共用 Rust 状态、校验和更新通知。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { desktopConnection, type DesktopCall } from "./desktop-client.js";

export type ComponentId = "writing" | "resources";
export type ComponentPatch = Record<string, unknown>;
export interface ComponentSnapshot { component: ComponentId; revision: number; state: Record<string, unknown> }
export type ComponentRequest = { action: "read" | "close"; component: ComponentId }
  | { action: "patch"; component: ComponentId; patch: ComponentPatch }
  | { action: "open"; component: ComponentId; patch?: ComponentPatch };
type Envelope = { action: "component"; request: ComponentRequest };

/** 返回完整快照；open 可同时更新并打开，窗口失败不回滚已提交状态。 */
export function componentClient(call: DesktopCall<Envelope>) {
  return {
    read: (component: ComponentId) => call<ComponentSnapshot>({ action: "component", request: { action: "read", component } }),
    patch: (component: ComponentId, patch: ComponentPatch) => call<ComponentSnapshot>({ action: "component", request: { action: "patch", component, patch } }),
    open: (component: ComponentId, patch?: ComponentPatch) => call<ComponentSnapshot>({ action: "component", request: { action: "open", component, ...(patch ? { patch } : {}) } }),
    close: (component: ComponentId) => call<null>({ action: "component", request: { action: "close", component } }),
  };
}
export type ComponentClient = ReturnType<typeof componentClient>;
/** 仅桌面父进程注入的连接可用；独立 server 不注册组件工具。 */
export function applicationComponents(env = process.env): ComponentClient | undefined {
  const call = desktopConnection<Envelope>(env.YUNFENG_APP_PORT, env.YUNFENG_APP_TOKEN, "应用组件", 8 * 1024 * 1024);
  return call && componentClient(call);
}
