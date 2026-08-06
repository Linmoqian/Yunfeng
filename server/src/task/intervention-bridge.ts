// InterventionBridge：pi 扩展的 confirm/select/input 与任务审批之间的桥接。
// 独立于 rpc-manager 与 task-runtime 之外，避免循环依赖。
// rpc-manager 通过 getHandler(sessionId) 把 uiContext 分派到任务审批流，
// task-runtime 在 attach 会话时 register() 各自的 handler。

export interface ConfirmRequest {
  title: string;
  message: string;
  safeLabel?: string;
  impact?: string;
}

export interface SelectRequest {
  title: string;
  message: string;
  options: string[];
  defaultValue?: string;
}

export interface InputRequest {
  title: string;
  message: string;
  defaultValue?: string;
}

export type SelectResolution = string | undefined;
export type InputResolution = string | undefined;

export interface TaskInterventionHandler {
  requestConfirm(request: ConfirmRequest): Promise<boolean>;
  requestSelect(request: SelectRequest): Promise<SelectResolution>;
  requestInput(request: InputRequest): Promise<InputResolution>;
  /** 服务重启或会话销毁时，将未决介入标记失效。 */
  invalidatePending(requestId?: string): void;
}

declare global {
  var __yfInterventionBridge: Map<string, TaskInterventionHandler> | undefined;
}

function getBridge(): Map<string, TaskInterventionHandler> {
  if (!globalThis.__yfInterventionBridge) {
    globalThis.__yfInterventionBridge = new Map();
  }
  return globalThis.__yfInterventionBridge;
}

export function registerInterventionHandler(sessionId: string, handler: TaskInterventionHandler): () => void {
  getBridge().set(sessionId, handler);
  return () => getBridge().delete(sessionId);
}

export function getInterventionHandler(sessionId: string): TaskInterventionHandler | undefined {
  return getBridge().get(sessionId);
}

/** 无 handler 时的默认行为：坚决拒绝/返回空，绝不自动放行。 */
export function getInterventionHandlerOrReject(sessionId: string): TaskInterventionHandler {
  return getInterventionHandler(sessionId) ?? {
    requestConfirm: () => Promise.resolve(false),
    requestSelect: () => Promise.resolve(undefined),
    requestInput: () => Promise.resolve(undefined),
    invalidatePending: () => {},
  };
}
