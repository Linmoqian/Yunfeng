/* 组件调用契约与桌面 SDK；桌面状态由 Rust 管理，任务组件可复用调用器。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { desktopConnection, type DesktopCall } from "./desktop-client.js";

export type ComponentId = "writing" | "resources";
export interface ComponentFocus<Id extends string = ComponentId> { component: Id; revision: number; target: string | null }
export type ComponentPatch = Record<string, unknown>;
export interface ComponentSnapshot<Id extends string = ComponentId, State = Record<string, unknown>> { component: Id; revision: number; state: State; focus?: ComponentFocus<Id> }
export type ComponentRequest<Id extends string = ComponentId, Patch = ComponentPatch> = { action: "read" | "close"; component: Id }
  | { action: "focus"; component: Id; target?: string }
  | { action: "blur"; component: Id }
  | { action: "patch"; component: Id; patch: Patch }
  | { action: "open"; component: Id; patch?: Patch };
export type ComponentEnvelope<Id extends string = ComponentId, Patch = ComponentPatch> = { action: "component"; request: ComponentRequest<Id, Patch> };
type Envelope = ComponentEnvelope;

/** 返回完整快照；open 可同时更新并打开，窗口失败不回滚已提交状态。 */
export function componentClient<Id extends string = ComponentId, Patch = ComponentPatch, State = Record<string, unknown>>(call: DesktopCall<ComponentEnvelope<Id, Patch>>) {
  return {
    read: (component: Id) => call<ComponentSnapshot<Id, State>>({ action: "component", request: { action: "read", component } }),
    patch: (component: Id, patch: Patch) => call<ComponentSnapshot<Id, State>>({ action: "component", request: { action: "patch", component, patch } }),
    open: (component: Id, patch?: Patch) => call<ComponentSnapshot<Id, State>>({ action: "component", request: { action: "open", component, ...(patch ? { patch } : {}) } }),
    focus: (component: Id, target = "component") => call<ComponentFocus<Id>>({ action: "component", request: { action: "focus", component, target } }),
    blur: (component: Id) => call<ComponentFocus<Id>>({ action: "component", request: { action: "blur", component } }),
    close: (component: Id) => call<null>({ action: "component", request: { action: "close", component } }),
  };
}
export type ComponentClient = ReturnType<typeof componentClient<ComponentId, ComponentPatch, Record<string, unknown>>>;
/** 仅桌面父进程注入的连接可用；独立 server 不注册组件工具。 */
export function applicationComponents(env = process.env): ComponentClient | undefined {
  const call = desktopConnection<Envelope>(env.YUNFENG_APP_PORT, env.YUNFENG_APP_TOKEN, "应用组件", 8 * 1024 * 1024);
  return call && componentClient<ComponentId, ComponentPatch, Record<string, unknown>>(call);
}
