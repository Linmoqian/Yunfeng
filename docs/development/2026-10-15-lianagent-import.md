# LianAgent 资源接入

接入日期：2026-10-15。来源为本机 `pod-agent` 当前检出文件；来源 Git HEAD 为 `3ea1ecf62454c7982e8314deb4260c14fb35beba`。来源工作区可能包含未提交内容，不将 HEAD 当作所有文件的版本证明。

## 前端依赖

沿用 Yunfeng 的 Ant Design、Motion、React Router DOM 和 Redux Toolkit。新增参考仓库中的以下依赖，版本范围取自来源清单；依赖安装不代表对应功能已经实现。

| 用途 | 依赖 |
| --- | --- |
| 拖拽 | `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities` |
| 编辑器 | `@monaco-editor/react`、`monaco-editor` |
| 三维 | `@react-three/drei`、`@react-three/fiber`、`@sparkjsdev/spark`、`three` |
| 表格与图表 | `@tanstack/react-table`、`recharts` |
| 文本与日期 | `highlight.js`、`rehype-highlight`、`date-fns` |
| 国际化与表单 | `i18next`、`react-i18next`、`react-hook-form` |
| 二维码 | `jsqr`、`qrcode` |
| 测试与类型 | Vitest、React Testing Library、user-event、jest-dom、jsdom、Three 与 QRCode 类型 |

共 19 个运行依赖、7 个开发依赖。未引进 Tailwind、shadcn、替代主题与通知库，避免违反现有技术栈约束；未引进另一版路由、Query 状态层、Axios 或新增 Tauri 文件权限。现有测试入口仍使用 Node，新增测试依赖供后续组件测试使用。未引进 Playwright。

## 技能

来源包含 215 个技能目录。新增 179 个缺失技能到 `.agents/skills/`，34 个同名技能沿用 Yunfeng 版本；两项 LianAgent 原生控制和 UI 技能由已有 Yunfeng 适配技能承担。保留技能脚本、参考资料、资源和上游 MIT 许可。

Pi SDK 可从项目 `.agents/skills/` 发现技能。桌面启动时也将技能播种到 `.lin/agent/skills/`，打包脚本把项目技能复制到产物的 `pi-assets/skills/`。只补充缺失文件，不覆盖用户已有文件；更新已有技能需显式维护。技能中的第三方软件、硬件、账号或环境变量仍需按具体任务准备，未批量安装或执行。

## 角色文件

引进 scout、worker、reviewer、researcher、oracle、delegate 六个角色到 `pi-assets/agents/`，将角色间引用的 `.pi/agents/` 改为 `.lin/agent/agents/`。桌面启动时播种到 Lin 目录，已有同名用户文件保留。

角色文件属于子代理提供器的输入。当前 Server 没有读取这些角色并启动子代理的桥接，Pi SDK 不会因目录存在而自动执行。角色声明中的 `contact_supervisor`、`pwsh_exec`、`test_pilot` 等工具也需要对应提供器。角色调度接入属于后续工作，不能据此声称已经可调用。

## 维护

- [运行架构](2026-10-15-runtime-architecture.md)
- [技能来源与许可](../../.agents/README.md)
- [角色说明](../../pi-assets/agents/README.md)

认证、模型密钥、个人设置和会话均未从参考仓库复制。
