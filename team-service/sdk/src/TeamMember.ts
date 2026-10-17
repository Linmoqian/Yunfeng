/* 所有团队成员的基础父类；公共协作方法通过成员凭据访问后端。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { MemberIdentity, MemberKind, MemberObservation, MemberService } from "./types.ts";

export abstract class TeamMember {
  readonly id: string;
  readonly #service: MemberService;
  protected abstract readonly kind: MemberKind;
  constructor(id: string, service: MemberService) { this.id = id; this.#service = service; }

  /** 返回服务确认的身份；类与身份不一致、成员已停用时失败。 */
  async identity(): Promise<MemberIdentity> {
    const member = await this.#service.identity();
    if (member.id !== this.id || member.profile.kind !== this.kind || !member.profile.enabled) throw new Error("MEMBER_IDENTITY_MISMATCH");
    return member;
  }
  /** 从最新身份资料计算操作权限；后端仍在每次操作时独立校验。 */
  async permissions() {
    const p = (await this.identity()).profile;
    return { read: true, message: p.access !== "observer", share: p.access !== "observer", board: p.access === "editor", robotControl: p.robotControl };
  }
  /** 观察本人和直属下级的快照；具体响应以节点接口契约为准。 */
  observe<T = MemberObservation>(): Promise<T> { return this.#service.observe<T>(); }
  /** 仅返回直属下级，不含上级、同级或更深层成员。 */
  children(): Promise<MemberIdentity[]> { return this.#service.children(); }
  /** UUID 可由调用方保留以安全重试；服务拒绝同 ID 不同正文。 */
  sendMessage(text: string, id = crypto.randomUUID()): Promise<unknown> {
    return this.#service.sendMessage(text, id);
  }
  publishAnnouncement(announcement: string, links: { title: string; url: string }[] = []): Promise<unknown> {
    return this.#service.publishAnnouncement(announcement, links);
  }
  shareFile(name: string, bytes: Uint8Array): Promise<unknown> {
    return this.#service.shareFile(name, bytes);
  }
  readFile(id: string): Promise<unknown> { return this.#service.readFile(id); }
  /** 仅向直接子类提供授权能力，避免其接触服务或请求协议。 */
  protected authorizeRobot(operation: string): Promise<void> { return this.#service.authorizeRobot(operation); }
}
