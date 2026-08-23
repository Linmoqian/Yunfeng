# SciVerse 文献检索扩展

把 [SciVerse 开放平台](https://sciverse.opendatalab.com/docs) 的学术文献检索能力接入 pi：结构化检索、语义 RAG、全文读取、引用图谱与论文图片。

## 工具

- `search_papers`：按标题/作者/期刊/年份/学科结构化检索论文元数据
- `semantic_search`：自然语言语义检索，返回相关全文片段（RAG 用）
- `read_content`：按 doc_id + 字节偏移读取论文原文片段
- `list_catalog`：查询可用过滤字段、枚举值与操作符
- `list_paper_relations`：分页查询引用/被引/相关工作
- `get_resource`：读取论文内嵌图片（Figure / Table）

接口定义以官方文档（https://sciverse.space/docs）为准，并用真实 API 请求校验字段。请求体按后端实际接受的结构构造：meta-search 便捷字段（作者/年份/期刊等）映射为 `filters`/`sort` 数组；agentic-search 直接透传 `query`/`top_k`/`sub_queries`/`filters`（已废弃的 `mode`/`retrieval` 不再发送）。无新增依赖，直接使用 fetch 调用。使用指引以 Skill（`sciverse-literature`）形式渐进式注入。

## 目录结构

本目录是一个 pi 扩展包（package.json 声明 `pi.extensions` 与 `pi.skills`）：

```text
sciverse/
├── package.json          # pi manifest：extensions + skills
├── index.ts              # 扩展工厂：注册 6 个工具
├── tools.ts              # 工具定义（typebox 参数 schema）
├── api.ts                # fetch 客户端、鉴权与错误处理
├── README.md
└── skills/sciverse-literature/SKILL.md
```

注意：含 `skills/` 等资源子目录的扩展目录必须提供 package.json manifest，否则 pi 会把它当作纯资源包，`index.ts` 不会被加载为扩展。

## 使用

1. 在 https://sciverse.space 控制台创建 Token，设置环境变量：

```bash
export SCIVERSE_API_TOKEN=sci_xxx
```

2. 临时加载：

```bash
./pi-test.sh -e packages/coding-agent/examples/extensions/sciverse
```

或复制到全局扩展目录常驻：

```bash
cp -R packages/coding-agent/examples/extensions/sciverse ~/.pi/agent/extensions/
```

3. 直接提问即可，例如「找 Hinton 2020 年后关于深度学习的论文」「Transformer 注意力机制如何工作？」。

## 验证

- 扩展代码通过 `npm run check`（biome + tsgo）。
- 工具执行逻辑通过 mock fetch 验证；真实调用需有效 Token（本仓库不提交任何密钥）。
