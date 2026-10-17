/* 成员凭据专用传输；只能调用本机节点的成员入口，不能提升为控制令牌。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { MemberTransport } from "./types.ts";
export function memberTransport(address: string, token: string): MemberTransport {
  const url = new URL(address);
  if (url.protocol !== "http:" || !/^(127\.\d+\.\d+\.\d+|\[::1\])$/.test(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("MEMBER_INVALID_ADDRESS");
  return { async call<T>(input: Record<string, unknown>): Promise<T> {
    const response = await fetch(new URL("/v1/member", url), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal: AbortSignal.timeout(20_000), redirect: "error" });
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value?.error?.code === "string" ? value.error.code : "MEMBER_REQUEST_FAILED");
    return value as T;
  } };
}
