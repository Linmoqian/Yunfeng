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
export interface MemberTransport {
  /** 使用当前成员的凭据调用节点；认证、授权、超时和业务失败均拒绝 Promise。 */
  call<T>(input: Record<string, unknown>): Promise<T>;
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
