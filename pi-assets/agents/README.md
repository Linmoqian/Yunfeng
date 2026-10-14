# Lin Agent 角色定义

从 LianAgent `.pi/agents/` 引进 scout、worker、reviewer、researcher、oracle、delegate 六个角色文件。产品运行时目录为 `~/.lin/agent/agents/`，现有同名用户文件不覆盖。

这些文件是子代理提供器的角色输入，Pi SDK 本身不会仅凭该目录自动启动子代理。Yunfeng 当前尚未接入读取这些角色的子代理桥接；文件中的 `contact_supervisor`、`pwsh_exec`、`test_pilot` 等工具需对应提供器，不能据此声称可调用。
