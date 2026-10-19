/* React 提交后确认呈现版本；保存中及失败后的未提交输入不确认。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { useLayoutEffect, useRef } from "react";
import { setPresentation } from "../services/componentInteraction";
import type { SharedComponentId } from "../services/componentSharing";
export function useComponentPresentation(component: SharedComponentId, revision: number, ready: boolean, pending: boolean) {
  const instance = useRef(Symbol(component));
  useLayoutEffect(() => {
    setPresentation(instance.current, { component, revision: null, pending });
    const frame = requestAnimationFrame(() => setPresentation(instance.current, { component, revision: ready && !pending ? revision : null, pending }));
    return () => { cancelAnimationFrame(frame); setPresentation(instance.current); };
  }, [component, revision, ready, pending]);
}
