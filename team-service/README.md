# Yunfeng 团队服务

独立 Rust crate。`Store` 与 `model` 管理团队、公告和消息，不依赖 Tauri；桌面 `collaboration_action` 直接复用它们。可选 `node` feature 提供可单独启动的本机 HTTP/JSON 节点，桌面构建默认不带网络能力。每个节点的数据目录、安装 ID、控制凭据和数据库均独立，邻居之间直接交换事件，没有固定中心角色。

## 启动与验收

```sh
cargo build --features node
./target/debug/yunfeng-team-node --data-dir /tmp/yunfeng-node-a --name A --bind 127.0.0.1:19001
./target/debug/yunfeng-team-node --data-dir /tmp/yunfeng-node-b --name B --bind 127.0.0.1:19002
./target/debug/yunfeng-team-node --data-dir /tmp/yunfeng-node-c --name C --bind 127.0.0.1:19003
```

每条启动命令在独立终端运行。数据目录应专属于该节点；重启沿用原名称、目录和稳定端口。默认监听 `127.0.0.1:0`，stdout 仅输出实际地址与节点身份。控制令牌保存在目录内的 `control.token`，不作为命令参数或日志输出；数据目录权限 0700，凭据文件 0600。同一目录只允许一个服务实例，进程退出后文件锁自动释放。不要将测试节点指向运行中桌面应用的数据目录。

```sh
cargo test --features node
cargo clippy --all-targets --features node -- -D warnings
python3 tests/local_nodes.py
python3 tests/local_nodes.py --presence --report /tmp/yunfeng-presence-report.json
```

验收脚本启动三个真实进程，在临时目录形成 A—B—C，验证四类成员资料同步、外宿主改写拒绝、成员凭据与权限重启保留、跨邻居消息/公告、原始源码文件与 SHA-256、重复同步、公告收敛、错误凭据、非法文件名、停机与重启恢复，最后停止节点并清理该脚本自己的临时数据。可用 `--report <文件>` 输出不含凭据的结果。

`--presence` 复用这三个实例，额外验证在线、工作中、空闲状态跨两跳同步、直属可见范围、重复转发不续期、宿主重启不恢复本人旧状态、保持其他节点心跳时实等90秒断线过期，以及重启重新上报后的恢复。状态不进入事件日志，验收报告不含凭据。

## 最小调用方式

`POST /v1/local` 接受 JSON `action`，Header 为 `Authorization: Bearer <本机 control.token 内容>`。以下 Python 示例从本机文件读取凭据，变量 `node_url` 使用启动输出的地址：

```python
import json, pathlib, urllib.request
node_url = "http://127.0.0.1:19001"
token = pathlib.Path("/tmp/yunfeng-node-a/control.token").read_text()
def call(action):
    request = urllib.request.Request(node_url + "/v1/local",
        data=json.dumps(action).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)
state = call({"action": "create", "name": "本地团队"})
invitation = call({"action": "invite"})  # 敏感配对票据，仅交给要加入的本机节点
```

B 使用自己的控制接口调用 `join`，传入 A 的 invitation；C 可用 B 的 invitation 加入。`message`、`board` 和 `share` 先保存本机，`sync` 与直接邻居双向交换并合并；每个节点都能邀请与同步。A 同步 B、B 同步 C 后，A 的事件可到达 C。`sync` 同时交换成员心跳的剩余租约，不把临时状态加入事件日志；重复转发不续命，重启后的新上报使用原逻辑时钟的新修订。没有自动轮询或后台重试，调用方根据任务事件触发 `sync` 并检查每个邻居的 `ok`。

文件 `share` 接收显示名称与最多 1MiB 的 Base64 字节，服务计算 SHA-256，接收方再次验证；`file` 按 UUID 读取内容。服务不会接受任意磁盘路径、遍历目录或自动写出下载文件。文件字节只保存在本地数据库的事件中，前端快照仅返回清单。

成员使用独立 `/v1/member` 入口和每成员凭据；管理员登记身份与权限后签发凭据，成员不能使用节点控制动作。成员只可观察本人和直属下级；管理员用 relation 动作管理单父关系，成员无法查询上级或读取跨层文件。写入响应与查询共用过滤边界。公共父类及 human/agent/program/robot 继承由 [TypeScript SDK](sdk/README.md) 提供，机器人另按车辆、无人机、机械臂继承设备方法。桌面铭牌只保存资料，不自动启动助手或连接设备。

完整契约见 [节点接口](../docs/api/2026-10-17-team-node.md)。桌面内的本地公告/消息和独立服务共享核心与存储格式，但桌面尚未连接这些独立节点；局域网发现、远程身份签名、加密传输和自动文件目录同步尚未实现。

## 数据与边界

`store.sqlite3` 是事实来源：业务记录与不可变同步事件在同一事务提交，导入失败整批回滚。公告以 `(Lamport clock, origin UUID, event UUID)` 的最大值收敛；这是确定性冲突规则，不代表时间较晚的人工修改一定获胜。消息按 UUID 去重，界面按本地入库顺序展示；各节点顺序可能不同。每队同步日志最多1000事件、6MiB，单文件最多1MiB；这是有界的本机验证版本，未实现日志压缩和历史分页。

首版只接受 IP 字面量的回环 HTTP 地址，拒绝公网/局域网地址、URL 凭据、查询参数、重定向及浏览器 Origin。显式邀请有效十分钟且只用于一条节点连接；控制凭据不交给邻居，每条边的两个方向各有独立团队范围凭据。已配对节点在其团队内相互信任，事件未做来源签名，不可用于不可信或跨机器网络。
