/* 人类、Agent 与普通程序继承同一成员父类；助手信息来自服务端身份铭牌。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { TeamMember } from "./TeamMember.ts";
import type { AssistantInfo } from "./types.ts";
export class HumanMember extends TeamMember { protected readonly kind = "human" as const; }
export class ProgramMember extends TeamMember { protected readonly kind = "program" as const; }
export class AgentMember extends TeamMember {
  protected readonly kind = "agent" as const;
  async assistantInfo(): Promise<AssistantInfo | null> { return (await this.identity()).profile.assistant; }
}
