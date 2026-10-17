# 团队成员 SDK

先定义 `TeamMember` 公共父类，再按身份继承。节点是宿主，一个节点可以托管多个成员；每个成员使用自己的凭据。

```text
TeamMember
├── HumanMember
├── AgentMember
├── ProgramMember
└── RobotMember<Command, Telemetry>
    ├── VehicleRobot
    ├── DroneRobot
    └── RoboticArm
```

父类提供 `identity()`、`permissions()`、`observe()`、`sendMessage()`、`publishAnnouncement()`、`shareFile()` 和 `readFile()`。`AgentMember.assistantInfo()` 返回助手模型、提供方与技能资料。身份种类不自动授予权限；每次请求由 Rust 查询数据库中的当前权限。

## 调用

本模块无运行依赖，以 TypeScript 源码导出，适合支持类型剥离的 Node 或现有 TS 构建工具。管理员先通过节点控制接口登记 `member`，再 `grant` 获得该成员专用令牌。令牌从本机受保护配置读取，不能写入源码、日志或前端资料。

```ts
import { AgentMember, memberTransport } from "./src/index.ts";
// memberId、address、memberToken 由调用方的受保护配置提供。
const assistant = new AgentMember(memberId, memberTransport(address, memberToken));
await assistant.identity();
await assistant.sendMessage("实验结果已整理");
```

`memberTransport` 仅访问回环 HTTP 的 `/v1/member`，20 秒超时，不跟随重定向。只读身份不能发送消息或分享文件；协作身份可以发送与分享；编辑身份可另行保存公告和链接。`enabled=false` 立即拒绝成员请求。角色变更、停用与令牌轮换都在下一次请求生效。完整字段、限制和错误见 [节点接口](../../docs/api/2026-10-17-team-node.md)。

## 实体机器人

`RobotMember` 增加 `connect()`、`disconnect()`、`readTelemetry()`、`execute(command)` 和 `emergencyStop()`。必须注入真正的 `RobotAdapter`；本模块没有默认硬件驱动。车辆仅接受 `drive`，无人机接受 `takeoff/land/velocity`，机械臂接受 `joints/gripper`，字段名明确米、秒、弧度及牛顿等单位。持续运动指令最多 5 秒。

普通设备操作先核对身份、设备类型和服务授权，再读取新鲜遥测；运动前要求连接正常、非急停状态、遥测时间不超过 2 秒（允许时钟领先 1 秒），执行必须获得适配器确认。`robotControl` 默认关闭且只能用于机器人，动作还必须出现在登记的 capabilities 中。`robotAuthorize` 只返回授权结果，不执行设备动作。

`emergencyStop()` 是持有硬件适配器的本地失效保护，直接调用适配器，不等待网络授权或普通运动队列；它不是免认证的远程接口。硬件适配器仍须处理连接超时、断线停车、限速、限位、坐标转换、取消与设备安全联锁。软件授权和遥测检查不能替代硬件保护。当前验收只覆盖真实节点授权与测试适配器边界，尚未连接车辆、无人机或机械臂实物。

## 核心验证

在仓库根目录运行：

```sh
cargo build --manifest-path team-service/Cargo.toml --features node
node --experimental-strip-types --test team-service/sdk/tests/members.test.ts
pnpm --dir app exec tsc -p ../team-service/sdk/tsconfig.json
```

测试启动自己的临时真实节点，验证身份、固定作者、即时权限与令牌轮换；机器人测试使用明确的测试适配器，验证未授权和过期遥测不会到达执行方法，以及离线急停路径。
