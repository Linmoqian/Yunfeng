/* 核心继承与授权闭环；真实节点验证成员身份，测试适配器仅核对硬件边界。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { TeamMember, HumanMember, AgentMember, ProgramMember, RobotMember, VehicleRobot, memberTransport } from "../src/index.ts";
import type { MemberProfile, MemberCard, RobotAdapter, RobotTelemetry, MemberTransport } from "../src/types.ts";
// VehicleCommand lives with the concrete robot, avoiding base classes depending on a subtype.
import type { VehicleCommand as Drive } from "../src/robots.ts";

test("真实节点为四种身份固定作者并即时执行权限、停用与凭据轮换", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yf-member-sdk-"));
  const binary = new URL("../../target/debug/yunfeng-team-node", import.meta.url);
  const child = spawn(binary.pathname, ["--data-dir", directory, "--name", "SDK 验收节点"]);
  let address = "", control = "";
  const lines = createInterface({ input: child.stdout });
  const call = async <T = any>(input: unknown, token = control, route = "/v1/local"): Promise<T> => {
    const response = await fetch(address + route, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal: AbortSignal.timeout(5000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error.code);
    return value;
  };
  try {
    const [line] = await once(lines, "line", { signal: AbortSignal.timeout(10_000) });
    address = JSON.parse(line).address;
    control = await readFile(join(directory, "control.token"), "utf8");
    await call({ action: "create", name: "混合成员验收" });
    async function register(kind: MemberProfile["kind"], access: MemberProfile["access"]) {
      const id = crypto.randomUUID();
      const profile: MemberProfile = { kind, access, name: kind + " 验收成员", summary: "本地身份验收", enabled: true, robotControl: false, assistant: kind === "agent" ? { model: "test-model", provider: "本地测试", skills: ["实验记录"] } : null, robot: kind === "robot" ? { kind: "vehicle", model: "接口测试车辆", capabilities: ["drive"] } : null };
      await call({ action: "member", member: { id, profile } });
      const { token } = await call({ action: "grant", id });
      return { id, profile, token, transport: memberTransport(address, token) };
    }
    const human = await register("human", "observer"), agent = await register("agent", "contributor"), program = await register("program", "observer"), robot = await register("robot", "observer");
    const people = [new HumanMember(human.id, human.transport), new AgentMember(agent.id, agent.transport), new ProgramMember(program.id, program.transport)];
    assert(people.every((member) => member instanceof TeamMember));
    const assistant = people[1] as AgentMember;
    assert.equal((await assistant.assistantInfo())?.model, "test-model");
    assert.equal((await people[0].identity()).profile.kind, "human");
    assert.equal("execute" in people[0], false);
    assert.equal("execute" in assistant, false);
    await assert.rejects(people[2].sendMessage("越权"), /NODE_FORBIDDEN/);
    await assert.rejects(assistant.publishAnnouncement("越权公告"), /NODE_FORBIDDEN/);
    const messageId = crypto.randomUUID();
    await assistant.sendMessage("真实凭据固定作者", messageId);
    await assistant.sendMessage("真实凭据固定作者", messageId);
    let state = await call({ action: "snapshot" });
    assert.equal(state.snapshot.messages.length, 1);
    assert.equal(state.snapshot.messages[0].memberId, agent.id);
    assert.equal(state.snapshot.messages[0].name, agent.profile.name);
    assert(!JSON.stringify(state).includes(agent.token));
    await assert.rejects(call({ action: "shutdown" }, agent.token, "/v1/member"), /COLLAB_INPUT/);
    await assert.rejects(call({ action: "snapshot" }, agent.token), /NODE_FORBIDDEN/);
    await assert.rejects(robot.transport.call({ action: "robotAuthorize", operation: "drive" }), /NODE_FORBIDDEN/);
    await robot.transport.call({ action: "robotAuthorize", operation: "telemetry" });
    agent.profile.access = "editor";
    await call({ action: "member", member: { id: agent.id, profile: agent.profile } });
    await assistant.publishAnnouncement("授权后的真实公告");
    agent.profile.access = "observer";
    await call({ action: "member", member: { id: agent.id, profile: agent.profile } });
    await assert.rejects(assistant.sendMessage("撤权后不可发送"), /NODE_FORBIDDEN/);
    const rotated = await call({ action: "grant", id: agent.id, rotate: true });
    await assert.rejects(assistant.identity(), /NODE_FORBIDDEN/);
    assert.equal((await new AgentMember(agent.id, memberTransport(address, rotated.token)).identity()).id, agent.id);
    agent.profile.enabled = false;
    await call({ action: "member", member: { id: agent.id, profile: agent.profile } });
    await assert.rejects(memberTransport(address, rotated.token).call({ action: "identity" }), /NODE_FORBIDDEN/);
    state = await call({ action: "snapshot" });
    assert.equal(state.snapshot.board, "授权后的真实公告");
    assert.equal(state.snapshot.participants.length, 5);
  } finally {
    if (address && control) await call({ action: "shutdown" }).catch(() => child.kill());
    else child.kill();
    if (child.exitCode === null) await once(child, "exit");
    lines.close(); await rm(directory, { recursive: true });
  }
});

test("实体机器人继承基类，设备类型、授权、遥测和急停不串入普通协作", async () => {
  const card: MemberCard = { id: "robot", nodeId: "node", profile: { name: "测试车辆", kind: "robot", access: "observer", enabled: true, robotControl: true, summary: "", assistant: null, robot: { kind: "vehicle", model: "test", capabilities: ["drive"] } } };
  let allowed = false, commands = 0, stops = 0;
  let telemetry: RobotTelemetry = { connected: true, timestamp: new Date().toISOString(), emergencyStopped: false };
  const transport: MemberTransport = { async call<T>(input: Record<string, unknown>): Promise<T> { if (input.action === "identity") return card as T; if (!allowed) throw new Error("NODE_FORBIDDEN"); return { authorized: true } as T; } };
  const adapter: RobotAdapter<Drive> = { async connect() {}, async disconnect() {}, async telemetry() { return telemetry; }, async execute() { commands++; return { acknowledged: true, timestamp: new Date().toISOString() }; }, async emergencyStop() { stops++; return { acknowledged: true, timestamp: new Date().toISOString() }; } };
  const vehicle = new VehicleRobot(card.id, transport, adapter);
  assert(vehicle instanceof RobotMember && vehicle instanceof TeamMember);
  const command: Drive = { action: "drive", linearMetersPerSecond: .1, angularRadiansPerSecond: 0, durationMs: 100 };
  await assert.rejects(vehicle.execute(command), /NODE_FORBIDDEN/); assert.equal(commands, 0);
  allowed = true;
  await vehicle.execute(command); assert.equal(commands, 1);
  telemetry = { ...telemetry, timestamp: "2000-01-01T00:00:00Z" };
  await assert.rejects(vehicle.execute(command), /ROBOT_STALE_TELEMETRY/); assert.equal(commands, 1);
  card.profile.robot!.kind = "drone";
  await assert.rejects(vehicle.connect(), /ROBOT_KIND_MISMATCH/);
  allowed = false;
  await vehicle.emergencyStop(); assert.equal(stops, 1);
});
