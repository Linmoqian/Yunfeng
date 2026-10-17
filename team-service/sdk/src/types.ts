/* 团队成员公共契约；类型与执行权限独立，实体机器人具有设备专属信息。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
export type MemberKind = "human" | "agent" | "program" | "robot";
export type MemberAccess = "observer" | "contributor" | "editor";
export type RobotKind = "vehicle" | "drone" | "arm" | "other";
export interface AssistantInfo { model: string; provider: string; skills: string[] }
export interface RobotInfo { kind: RobotKind; model: string; capabilities: string[] }
export interface MemberProfile {
  name: string;
  kind: MemberKind;
  access: MemberAccess;
  summary: string;
  enabled: boolean;
  robotControl: boolean;
  assistant: AssistantInfo | null;
  robot: RobotInfo | null;
}
export interface MemberCard { id: string; nodeId: string; profile: MemberProfile }
export type MemberIdentity = Omit<MemberCard, "nodeId">;
export interface MemberObservation {
  identity: MemberIdentity;
  children: MemberIdentity[];
  messages: { id: string; memberId: string; name: string; text: string; createdAt: number }[];
  files: { id: string; memberId: string; name: string; size: number; sha256: string }[];
  boards: { memberId: string; announcement: string; links: { title: string; url: string }[] }[];
}
export interface MemberTransport {
  /** 使用当前成员的凭据调用节点；认证、授权、超时和业务失败均拒绝 Promise。 */
  call<T>(input: Record<string, unknown>): Promise<T>;
}
/** 成员直接依赖的业务边界；实现方只返回结果，不持有或回调上层成员。 */
export interface MemberService {
  identity(): Promise<MemberIdentity>;
  observe<T = MemberObservation>(): Promise<T>;
  children(): Promise<MemberIdentity[]>;
  sendMessage(text: string, id: string): Promise<unknown>;
  publishAnnouncement(announcement: string, links: { title: string; url: string }[]): Promise<unknown>;
  shareFile(name: string, bytes: Uint8Array): Promise<unknown>;
  readFile(id: string): Promise<unknown>;
  authorizeRobot(operation: string): Promise<void>;
}
export interface RobotTelemetry {
  connected: boolean;
  timestamp: string;
  emergencyStopped: boolean;
  batteryPercent?: number;
}
export interface RobotAck { acknowledged: boolean; timestamp: string }
/** 真实硬件驱动边界；实现方必须验证设备限位、坐标系和安全联锁，不得伪造回执。 */
export interface RobotAdapter<Command, Telemetry extends RobotTelemetry = RobotTelemetry> {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  telemetry(): Promise<Telemetry>;
  execute(command: Command): Promise<RobotAck>;
  emergencyStop(): Promise<RobotAck>;
}
