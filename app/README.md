# Yunfeng 客户端

| 目录 | 内容与入口 |
| --- | --- |
| [desktop](desktop/README.md) | 桌面 React/Tauri 应用，在此执行 `pnpm tauri dev` |
| [mobile](mobile/README.md) | 当前移动薄客户端，根 workspace 安装后在此执行 `pnpm dev` |
| [cli](cli/README.md) | 独立 pnpm workspace，进入后安装依赖并执行 `pnpm cli` |

移动后端在 [mobile/backend](mobile/backend/README.md)，早期原型在 [mobile/legacy](mobile/legacy/README.md)。根 workspace 中的客户端成员为桌面、当前移动客户端和移动后端；CLI 使用已有独立锁文件，原型不参与根 workspace。

共享 Server、Gateway 与团队服务继续位于仓库根目录，职责见[项目说明](../README.md)。目录迁移不改变用户数据、服务名称或发布包内的后端布局。
