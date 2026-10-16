/* 汇总页面读取与订阅状态；各入口只上报，工作区统一渲染一个胶囊。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ConnectionCapsule } from "./ConnectionCapsule";
const LoadingContext = createContext({ pending: 0, register: (): (() => void) => () => {} });
export function WorkspaceLoadingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);
  const register = useCallback(() => {
    setPending((count) => count + 1);
    return () => setPending((count) => count - 1);
  }, []);
  return <LoadingContext.Provider value={{ pending, register }}>{children}</LoadingContext.Provider>;
}
export function useWorkspaceLoading(active: boolean) {
  const { register } = useContext(LoadingContext);
  useEffect(() => { if (active) return register(); }, [active, register]);
}
export function WorkspaceLoadingIndicator({ busy, error, onRetry }: { busy: boolean; error: string | null; onRetry: () => void }) {
  const { pending } = useContext(LoadingContext);
  return <ConnectionCapsule busy={busy || pending > 0} error={error} onRetry={onRetry} />;
}
