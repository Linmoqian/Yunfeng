/* 成员业务服务：将语义操作转换为下一层请求，不感知成员类和调用者。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { MemberIdentity, MemberService, MemberTransport } from "./types.ts";

/** 包装请求端口；权限与业务失败原样拒绝，服务不缓存成员状态或持有上层引用。 */
export function createMemberService(transport: MemberTransport): MemberService {
  return {
    identity: () => transport.call<MemberIdentity>({ action: "identity" }),
    observe: <T>() => transport.call<T>({ action: "snapshot" }),
    children: () => transport.call<MemberIdentity[]>({ action: "children" }),
    sendMessage: (text, id) => transport.call({ action: "message", id, text }),
    publishAnnouncement: (announcement, links) => transport.call({ action: "board", announcement, links }),
    shareFile(name, bytes) {
      if (bytes.byteLength > 1024 * 1024) throw new Error("MEMBER_FILE_LIMIT");
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return transport.call({ action: "share", name, data: btoa(binary) });
    },
    readFile: (id) => transport.call({ action: "file", id }),
    async authorizeRobot(operation) {
      const result = await transport.call<{ authorized: boolean; operation: string }>({ action: "robotAuthorize", operation });
      if (result.authorized !== true || result.operation !== operation) throw new Error("ROBOT_AUTHORIZATION_UNCONFIRMED");
    },
  };
}
