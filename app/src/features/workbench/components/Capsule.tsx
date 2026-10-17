/* 兼容工作台旧入口；新增调用统一使用 components/common。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Capsule as SharedCapsule, type CapsuleProps } from "../../../components/common/Capsule";

export function Capsule(props: Omit<CapsuleProps, "appearance">) {
  return <SharedCapsule {...props} appearance="plain" />;
}
