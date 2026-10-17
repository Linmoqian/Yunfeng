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

父类提供 `identity()`、`permissions()`、`children()`、`observe()`、`sendMessage()`、`publishAnnouncement()`、`shareFile()` 和 `readFile()`。`AgentMember.assistantInfo()` 返回助手模型、提供方与技能资料。身份种类不自动授予权限；每次请求由 Rust 查询数据库中的当前权限。

## 调用

本模块无运行依赖，以 TypeScript 源码导出，适合支持类型剥离的 Node 或现有 TS 构建工具。管理员先通过节点控制接口登记 `member`，再 `grant` 获得该成员专用令牌。令牌从本机受保护配置读取，不能写入源码、日志或前端资料。

```ts
import { AgentMember, connectMember } from "./src/index.ts";
// memberId、address、memberToken 由调用方的受保护配置提供。
const assistant = new AgentMember(memberId, connectMember(address, memberToken));
await assistant.identity();
await assistant.sendMessage("实验结果已整理");
```

`connectMember` 组装业务服务与传输；底层 `memberTransport` 仅访问回环 HTTP 的 `/v1/member`，20 秒超时，不跟随重定向。只读身份不能发送消息或分享文件；协作身份可以发送与分享；编辑身份可另行保存公告和链接。`enabled=false` 立即拒绝成员请求。角色变更、停用与令牌轮换都在下一次请求生效。完整字段、限制和错误见 [节点接口](../../docs/api/2026-10-17-team-node.md)。

## 单向分层

每层只调用直属下层的契约，下层不持有上层对象，也不导入调用它的成员类或界面。继承表达身份和设备能力；调用分层独立遵守以下方向：

```text
成员行为 → MemberService → MemberTransport → HTTP 节点
设备子类 → RobotMember → RobotAdapter → 实物驱动
```

`TeamMember` 只使用 MemberService 的语义方法，不拼 action、不编码文件、不访问 HTTP。机器人子类通过基类的授权与 dispatch 操作设备；基类的服务和硬件适配器使用运行时私有字段，子类无法取出它们越级调用。服务负责请求格式、文件编码和授权回执校验，传输负责 HTTP、凭据与超时。结果经 Promise 返回，不通过持有上层对象来反馈。

`connectMember(address, token)` 是集中组装入口，允许知道服务和 HTTP 的具体实现；普通业务只接收组装后的服务。自定义传输通过 `createMemberService(transport)` 接入，底层传输仅实现 `MemberTransport.call()`，无需知道 HumanMember、AgentMember、ProgramMember 或 RobotMember。调用方可为服务或硬件适配器注入独立实现，不必给下层父成员、页面或调度器引用。

本次实验性 SDK 的成员构造参数从原始 MemberTransport 改为 MemberService；原有 `new AgentMember(id, memberTransport(address, token))` 改为 `new AgentMember(id, connectMember(address, token))`。已有自定义传输外包一层 `createMemberService(transport)` 即可。HTTP JSON 契约与数据库格式不变。依赖回归测试阻止业务类直接导入 HTTP、下层反向导入上层以及动态导入绕过边界。

## 组织可见范围

`children()` 只返回直属下级。`observe()` 返回类型 MemberObservation，包含 identity、children，以及本人和直属下级的 messages/files/boards；身份采用 MemberIdentity（id、profile），不返回 nodeId、上级、同级、更深后代、全队名单或宿主邻居。所有成员身份遵守相同规则，editor 不扩大可见层级。文件即使知道 UUID，也要经过相同范围校验。

组织关系由管理员通过 relation 动作维护，保存在 Rust SQLite 并同步到对等节点。成员 SDK 不提供上级查询或组织管理入口。关系解除、改挂后立即按最新关系过滤历史数据，服务重启保留关系与凭据。未登记关系的成员为独立根。桌面 main 窗口及节点控制接口是全队管理员视图，与成员凭据入口分开。

本次成员 observe 和写入响应从 NodeSnapshot 收紧为 MemberObservation；原读取 `.snapshot.participants` 的调用方应改用 `.children` / `.identity`。成员公告通过 boards 数组读取，旧全局公告及无归属文件仅由管理员读取。该变化是实验性 SDK 的契约收紧，须与服务一起升级。

## 实体机器人

`RobotMember` 增加 `connect()`、`disconnect()`、`readTelemetry()`、`execute(command)` 和 `emergencyStop()`。必须注入真正的 `RobotAdapter`；本模块没有默认硬件驱动。车辆仅接受 `drive`，无人机接受 `takeoff/land/velocity`，机械臂接受 `joints/gripper`，字段名明确米、秒、弧度及牛顿等单位。持续运动指令最多 5 秒。

普通设备操作先核对身份、设备类型和服务授权，再读取新鲜遥测；运动前要求连接正常、非急停状态、遥测时间不超过 2 秒（允许时钟领先 1 秒），执行必须获得适配器确认。`robotControl` 默认关闭且只能用于机器人，动作还必须出现在登记的 capabilities 中。`robotAuthorize` 只返回授权结果，不执行设备动作。

`emergencyStop()` 是持有硬件适配器的本地失效保护，直接调用适配器，不等待网络授权或普通运动队列；它不是免认证的远程接口。硬件适配器仍须处理连接超时、断线停车、限速、限位、坐标转换、取消与设备安全联锁。软件授权和遥测检查不能替代硬件保护。当前验收只覆盖真实节点授权与测试适配器边界，尚未连接车辆、无人机或机械臂实物。

## 核心验证

在仓库根目录运行：

```sh
cargo build --manifest-path team-service/Cargo.toml --features node
node --experimental-strip-types --test team-service/sdk/tests/*.test.ts
pnpm --dir app exec tsc -p ../team-service/sdk/tsconfig.json
```

测试启动自己的临时真实节点，验证身份、固定作者、即时权限与令牌轮换；机器人测试使用明确的测试适配器，验证未授权和过期遥测不会到达执行方法，以及离线急停路径。

成员通过 `await member.reportStatus("working")` 自报状态（online/working/idle/offline）。运行时约20秒续报；90秒未续报显示离线，服务重启为未知。`observe().presence` 只含本人和直属成员，状态不改变权限。SDK 不创建后台定时器。节点控制方沿用 `sync` 转发剩余有效期，支持多跳；重复或旧心跳不能续期。宿主重启需重新上报，远端同步到新心跳后自动恢复；成员 API 与胶囊字段不变。
