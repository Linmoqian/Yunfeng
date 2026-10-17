/* 实体机器人基类；真实驱动通过适配器注入，每次控制前重新核验后端授权。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { TeamMember } from "./TeamMember.ts";
import type { MemberTransport, RobotAdapter, RobotKind, RobotTelemetry, RobotAck } from "./types.ts";

export abstract class RobotMember<Command, Telemetry extends RobotTelemetry = RobotTelemetry> extends TeamMember {
  protected readonly kind = "robot" as const;
  protected abstract readonly robotKind: RobotKind;
  private readonly adapter: RobotAdapter<Command, Telemetry>;
  constructor(id: string, transport: MemberTransport, adapter: RobotAdapter<Command, Telemetry>) {
    super(id, transport); this.adapter = adapter;
  }
  private async authorize(operation: string): Promise<void> {
    const member = await this.identity();
    if (member.profile.robot?.kind !== this.robotKind) throw new Error("ROBOT_KIND_MISMATCH");
    await this.transport.call({ action: "robotAuthorize", operation });
  }
  /** 只建立设备连接，不隐含启动电机、解锁或起飞。 */
  async connect(): Promise<void> { await this.authorize("connect"); await this.adapter.connect(); }
  async disconnect(): Promise<void> { await this.authorize("disconnect"); await this.adapter.disconnect(); }
  async readTelemetry(): Promise<Telemetry> { await this.authorize("telemetry"); return this.adapter.telemetry(); }
  /** 本地失效保护：持有硬件适配器时立即急停，不等待网络或进入普通运动队列。 */
  async emergencyStop(): Promise<RobotAck> {
    const ack = await this.adapter.emergencyStop();
    if (!ack.acknowledged) throw new Error("ROBOT_STOP_UNCONFIRMED");
    return ack;
  }
  protected async dispatch(operation: string, command: Command): Promise<RobotAck> {
    await this.authorize(operation);
    const telemetry = await this.adapter.telemetry();
    if (!telemetry.connected || telemetry.emergencyStopped) throw new Error("ROBOT_NOT_READY");
    const age = Date.now() - Date.parse(telemetry.timestamp);
    if (!Number.isFinite(age) || age < -1000 || age > 2000) throw new Error("ROBOT_STALE_TELEMETRY");
    const ack = await this.adapter.execute(command);
    if (!ack.acknowledged) throw new Error("ROBOT_COMMAND_REJECTED");
    return ack;
  }
  /** 子类限定本类硬件的指令；成功必须来自适配器的真实回执。 */
  abstract execute(command: Command): Promise<RobotAck>;
}
