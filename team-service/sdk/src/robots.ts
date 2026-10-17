/* 车辆、无人机与机械臂的设备专属指令；单位明确，硬件限位由适配器再次验证。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { RobotMember } from "./RobotMember.ts";
export type VehicleCommand = { action: "drive"; linearMetersPerSecond: number; angularRadiansPerSecond: number; durationMs: number };
export type DroneCommand = { action: "takeoff"; heightMeters: number } | { action: "land" } | { action: "velocity"; frame: "body" | "enu"; metersPerSecond: [number, number, number]; yawRadiansPerSecond: number; durationMs: number };
export type ArmCommand = { action: "joints"; positionsRadians: number[]; maxRadiansPerSecond: number } | { action: "gripper"; widthMeters: number; maxForceNewtons: number };
function finite(...values: number[]) { if (!values.every(Number.isFinite)) throw new Error("ROBOT_INVALID_COMMAND"); }
function positive(value: number) { finite(value); if (value <= 0) throw new Error("ROBOT_INVALID_COMMAND"); }
function duration(value: number) { positive(value); if (value > 5000) throw new Error("ROBOT_COMMAND_DURATION_LIMIT"); }
export class VehicleRobot extends RobotMember<VehicleCommand> {
  protected readonly robotKind = "vehicle" as const;
  execute(command: VehicleCommand) {
    if (command.action !== "drive") throw new Error("ROBOT_INVALID_COMMAND");
    finite(command.linearMetersPerSecond, command.angularRadiansPerSecond); duration(command.durationMs);
    return this.dispatch("drive", command);
  }
}
export class DroneRobot extends RobotMember<DroneCommand> {
  protected readonly robotKind = "drone" as const;
  execute(command: DroneCommand) {
    if (command.action === "takeoff") positive(command.heightMeters);
    else if (command.action === "velocity") {
      if (!["body", "enu"].includes(command.frame) || command.metersPerSecond.length !== 3) throw new Error("ROBOT_INVALID_COMMAND");
      finite(...command.metersPerSecond, command.yawRadiansPerSecond); duration(command.durationMs);
    } else if (command.action !== "land") throw new Error("ROBOT_INVALID_COMMAND");
    return this.dispatch(command.action, command);
  }
}
export class RoboticArm extends RobotMember<ArmCommand> {
  protected readonly robotKind = "arm" as const;
  execute(command: ArmCommand) {
    if (command.action === "joints") {
      if (!command.positionsRadians.length || command.positionsRadians.length > 32) throw new Error("ROBOT_INVALID_COMMAND");
      finite(...command.positionsRadians); positive(command.maxRadiansPerSecond);
    } else if (command.action === "gripper") {
      finite(command.widthMeters); positive(command.maxForceNewtons);
      if (command.widthMeters < 0) throw new Error("ROBOT_INVALID_COMMAND");
    } else throw new Error("ROBOT_INVALID_COMMAND");
    return this.dispatch(command.action, command);
  }
}
