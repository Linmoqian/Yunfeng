/* 所有团队成员的基础父类；公共协作方法通过成员凭据访问后端。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { MemberCard, MemberKind, MemberTransport } from "./types.ts";

export abstract class TeamMember {
  readonly id: string;
  protected readonly transport: MemberTransport;
  protected abstract readonly kind: MemberKind;
  constructor(id: string, transport: MemberTransport) { this.id = id; this.transport = transport; }

  /** 返回服务确认的身份；类与身份不一致、成员已停用时失败。 */
  async identity(): Promise<MemberCard> {
    const member = await this.transport.call<MemberCard>({ action: "identity" });
    if (member.id !== this.id || member.profile.kind !== this.kind || !member.profile.enabled) throw new Error("MEMBER_IDENTITY_MISMATCH");
    return member;
  }
  /** 从最新身份资料计算操作权限；后端仍在每次操作时独立校验。 */
  async permissions() {
    const p = (await this.identity()).profile;
    return { read: true, message: p.access !== "observer", share: p.access !== "observer", board: p.access === "editor", robotControl: p.robotControl };
  }
  /** 观察团队当前快照；具体响应以节点接口契约为准。 */
  observe<T = unknown>(): Promise<T> { return this.transport.call<T>({ action: "snapshot" }); }
  /** UUID 可由调用方保留以安全重试；服务拒绝同 ID 不同正文。 */
  sendMessage(text: string, id = crypto.randomUUID()): Promise<unknown> {
    return this.transport.call({ action: "message", id, text });
  }
  publishAnnouncement(announcement: string, links: { title: string; url: string }[] = []): Promise<unknown> {
    return this.transport.call({ action: "board", announcement, links });
  }
  shareFile(name: string, bytes: Uint8Array): Promise<unknown> {
    if (bytes.byteLength > 1024 * 1024) throw new Error("MEMBER_FILE_LIMIT");
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return this.transport.call({ action: "share", name, data: btoa(binary) });
  }
  readFile(id: string): Promise<unknown> { return this.transport.call({ action: "file", id }); }
}
