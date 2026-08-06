# TODO

## 阶段 0：可靠性与领域基础
- [x] 拆出 TaskStore / TaskEventHub / TaskRuntime 领域模块
- [x] 任务状态原子写入、事件日志、递增 seq、断线重放、结构化错误
- [x] pi 原始事件映射为领域事件（agent_end → waiting_input，不推断完成）
- [ ] 修复既有 SSE 清理：确保连接关闭时取消订阅并清除心跳
- [x] 单元测试：状态持久化、损坏恢复、事件 seq、命令校验、状态转换

## 阶段 1：真实任务工作台
- [x] 工作台改读 /api/tasks，按真实状态分组
- [x] 搜索、项目筛选、归档筛选、重命名、可恢复归档
- [x] 新任务创建成功后立即进入对应任务
- [x] 旧会话浏览与懒关联导入
- [x] URL 查询参数深链接 ?task=<id>&session=<id>
- [x] 页面状态 useReducer 统一管理

## 阶段 2：主流对话与运行控制
- [x] 消息支持 Markdown、代码块、复制、失败重试和从消息分支
- [x] 乐观消息 sending/sent/failed；失败消息可重发，不伪装为成功
- [x] 运行中 steer、清空排队、中止、重试；getQueue 命令
- [x] 后端 prompt/steer/followUp 透传图片与清空/查看队列命令
- [x] 每任务模型/思考等级/工具切换 + capabilities；运行中禁切（前后端双层校验）
- [ ] 对话分页加载（conversation 游标，后端待支持）
- [ ] 图片附件（≤4张/≤10MiB，后端 MIME/体积校验）
- [ ] @项目文件选择器（后端路径越界校验）

## 阶段 3：工具过程、审批与上下文
- [x] 工具调用在对话中按调用 ID 展示（名称、状态、参数摘要、输出、失败）
- [x] 工具输出默认折叠并限制事件负载长度；截断提示
- [x] Web UI Context 接管 confirm/select/input → 持久化介入请求 + 前端审批卡
- [x] 审批允许一次/拒绝；不提供永久全局放行
- [x] 未决审批在服务重启后失效，绝不自动放行；任务回 waiting_input
- [ ] 详情抽屉：活动 / 审批 / 上下文
- [ ] 上下文占用、自动压缩、手动压缩
- [ ] 命令面板 / slash commands / skills / 工具开关

## 阶段 4：改动审阅与 Git 闭环
- [ ] 改动页签：文件状态、增删统计、结构化 diff
- [ ] 任务 Git 基线，区分任务产生/既有改动
- [ ] 提交校验（Conventional Commits、拒绝敏感文件）
- [ ] 推送审批卡

## 阶段 5：整体验收与收敛
- [ ] 清理被替代的旧状态映射与样式
- [ ] 键盘操作补齐
- [ ] 320px/720px/桌面宽度与长会话无横向溢出
- [ ] SSE 断线重连按 seq 补齐
- [ ] 更新 README 领域 API 与限制说明

---
- [x] 按主题归档编码 Agent 设计对话
- [x] 接入 lin-workflow 工程规范与 project-engineering skill
