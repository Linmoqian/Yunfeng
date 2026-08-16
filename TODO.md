# TODO

- [x] 按推荐重组工程规范
- [x] 创建项目工程规范 Skill
- [x] 移除 Playwright 工具依赖
- [x] 补充根目录结构规范
- [x] 补充 GitHub 构建、推送与发行规范
- [x] 完善前端基础规范
- [x] 确认 React Router 路由选型
- [x] 确认 Lucide React 图标选型
- [x] 确认 Ant Design 与样式选型
- [x] 确认 Redux Toolkit 状态管理选型
- [x] 补充前端模块化与文件规模规范
- [x] 补充 Rust 与 Tauri 开发规范
- [x] 补充前后端热加载规范
- [x] 确认前端自动化测试框架
- [x] 确认前端技术选型
- [x] 补充代码注释规范
- [x] 补充并发与线程规范
- [x] 补充接口文档格式规范
- [x] 将工作台调整为对话优先布局
- [x] 将工作台界面与核心对话交互向 ChatGPT 对齐
- [x] 增加右侧会话信息与控制悬浮卡片
- [ ] 使用应用内目录选择器创建任务
- [ ] 统一工作台字体与下拉控件
- [x] 迁移 Dashi 任务看板前端并将入口置于新建任务下方
- [x] 按 Yunfeng 新设计 token 重构网页前端主题
- [x] 优化侧栏空态、云朵收起动效与任务看板入口
- [x] 按设计 token 重建任务看板与 /taskboard 路由界面
- [x] 新建任务改为直接创建空白对话
- [x] 精简工作台头部并调整离线提示文案
- [x] 移除侧栏空态补充文案与设置文字
- [x] 精简看板入口与侧栏空态布局
- [x] 调整侧栏搜索聚焦、看板表面与分组命名
- [x] 隐藏对话流中的工具调用记录
- [x] 使用 Yunfeng 枫叶标识助手消息
- [x] 移除任务会话头部与详情入口
- [ ] 确认云丛旧会话的删除语义（可恢复归档或永久删除）
- [x] yunfeng-cli TUI：新增云朵吉祥物组件（Mascot + 浮动动画 + demo）
- [x] yunfeng-cli TUI P0：flex 布局、逐行差分、消息滚动、选择器交互、编辑器键位、全屏模式
- [x] yunfeng-cli TUI P1：Scroll/Overlay/键位扩展/颜色降级/全局快捷键；P2 部分（visibleWidth 统一/测试/dispose）
- [x] yunfeng-cli TUI P2-16：架构文档 + demo 冒烟脚本（仅 TUI，不涉及 agent/cli 包）
- [x] yunfeng-cli CLI 入口：@yunfeng/cli 接入 TUI（createApp/main/bin）+ cli 架构文档
- [x] yunfeng-cli TUI 参考 pi 补全：StdinBuffer 输入缓冲 / Markdown 渲染 / Editor 撤销与词跳 / fuzzy 过滤
- [x] yunfeng-cli TUI 模仿 pi：提交语义 onSubmit / 主题系统 / 自动补全 / Loader spinner
- [x] 修复任务 API 错误返回 HTTP 200 的问题（结构化错误恢复真实 4xx/5xx）
- [x] 修复文件访问可通过符号链接越出允许根的问题（真实路径二次校验）
- [x] 修复任务事件流重连语义：缺省仅实时、Last-Event-ID 补发、快照不再覆盖旧会话

## 集成分支追加

- [x] 合并 gateway / 移动薄客户端 / 桌面 Tauri 壳到集成工作树
- [x] 移动端迁移到 mobile-app/，移除旧 yunfeng-mobile/ 原型目录
- [ ] 桌面壳接入可写 HOME / PI_CODING_AGENT_DIR
- [ ] 桌面壳一键启动编排（server + gateway + mobile-backend + RustDesk）
- [ ] 生产打包（包含后端运行时与 RustDesk）

## 移动端功能补齐与托盘增强

- [x] 审批卡支持 select/input 控件：选项点选、文本输入提交，defaultValue 随审批事件下发
- [x] 移动端任务看板：按状态分列、横向滚动吸附，侧栏列表/看板切换
- [x] 托盘分项状态与快捷操作：server/网关/移动后端/RustDesk 启停、状态文本与 tooltip 周期刷新、复制连接信息
- [x] 断线重连与错误恢复：全局在线探测、断线横幅、重连补拉对话、恢复提示
- [x] 推送通知：系统通知插件 + Web Notification 回退；任务完成/失败/待审批在页面隐藏时提醒
