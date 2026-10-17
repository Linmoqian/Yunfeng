/* 成员连接的组装入口；集中连接各层，业务类无需知道 HTTP 实现。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { memberTransport } from "./http.ts";
import { createMemberService } from "./service.ts";
import type { MemberService } from "./types.ts";

/** 创建使用本机成员凭据的业务服务；首个业务调用才发请求，错误由对应调用返回。 */
export function connectMember(address: string, token: string): MemberService {
  return createMemberService(memberTransport(address, token));
}
