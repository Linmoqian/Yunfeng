---
name: sciverse-literature
description: 使用 SciVerse 学术文献检索工具进行结构化检索、语义 RAG 检索、全文读取与引用关系查询。适用于检索论文、基于文献回答问题、读取论文全文或追踪引用关系的研究任务。
---

# SciVerse 文献检索

本项目内置 6 个 SciVerse 工具（search_papers / semantic_search / read_content / list_catalog / list_paper_relations / get_resource），通过 `SCIVERSE_API_TOKEN` 调用 https://api.sciverse.space。接口定义见官方文档 https://sciverse.space/docs。

## 环境准备

在 https://sciverse.space 控制台创建 Token（sci_ 开头），设置环境变量 `SCIVERSE_API_TOKEN` 后重启 pi（或重新加载扩展）。

## 未配置 Token 时（必读）

- 未设置 `SCIVERSE_API_TOKEN` 时，所有 SciVerse 工具调用都会失败，返回错误：未配置 SCIVERSE_API_TOKEN，请到 https://sciverse.space 控制台创建 Token（sci_ 开头），设置环境变量 SCIVERSE_API_TOKEN 后重新加载扩展。
- 遇到该错误时，如实告知用户工具因缺少 Token 无法使用，并说明创建 Token 与设置环境变量的步骤（见上）；不要编造检索结果，也不要假装调用成功。
- Token 无效（如过期或填错）时返回 401，错误信息为 ApiError 的 message，同样如实转述并提示用户检查 Token。

## 工具选型

| 场景 | 工具 |
|---|---|
| 结构化检索（作者/期刊/年份/标题/学科） | search_papers |
| 自然语言 RAG 检索 | semantic_search |
| 读取论文全文片段 | read_content |
| 查询字段 schema / 枚举值 | list_catalog |
| 引用/被引/相关工作 | list_paper_relations |
| 读取论文内嵌图片 | get_resource |

## 推荐流程

### RAG 问答（最常见）

1. semantic_search 用自然语言查询（可传 sub_queries=2-4 扩召回），得到相关 chunk（含 doc_id、offset、score）。
2. 对高相关 chunk 用 read_content(doc_id, offset) 扩展上下文。
3. 基于原文回答，并在答案中标注来源（论文标题 + doc_id）。

### 先摸清字段，再精确过滤

1. 首次接触或字段不明确时先调 list_catalog(include_sample_values=true) 学习字段与枚举值。
2. 再用 search_papers 的 filters_advanced 构造精确过滤（字段名以 list_catalog 为准，不要硬编码）。

### 受限语料内的语义检索（硬范围）

1. 先 search_papers(fields=["doc_id","title"]) 圈定候选集合（仅全文论文有 doc_id）。
2. 再 semantic_search(filters={"doc_id": [...]}) 在集合内检索；命中不越出集合，空数组返回空 hits（不退化为全局），去重上限 1000（超限 400 SCOPE_TOO_LARGE）。
3. 需要硬保证（如 fwci、引用图、复杂命中集）时用此链路；普通约束仍用软语义 filters。

### 多模态 RAG（图片）

1. read_content 返回的 Markdown 含 `![Fig](file_name)` 时，用 get_resource(file_name) 取图。
2. 图片字节可直接交给多模态模型解读。

## 注意事项

- search_papers 返回的 `is_content_accessible=false` 或缺失 `doc_id` 表示无全文，调用 read_content 前先检查。
- 引用/被引方向相反：CITATIONS=谁引用了我；REFERENCES=我引用了谁。
- 关系分页上限（仅 CITATIONS 可能触发）：关系数超 10000 返回 429，page×page_size 超 10000 返回 400；两种情况都改用 search_papers 的 filters_advanced 传 `references_unique_id` 反查（可深翻页并任意排序）。unique_id 不存在时返回 404。
- search_papers 深翻页用 cursor：把上一次响应 next_cursor 原样传回，可翻越 page×page_size=10000 上限；cursor 与 page>1 互斥。freshness_boost/impact_boost/language_affinity 仅在 query 非空且未显式 sort 时生效，启用后仅浅分页（无 cursor）。
- 错误码：401 Token 无效；400 参数错误（含 SCOPE_TOO_LARGE：doc_id 超 1000 个）；429 配额/关系数超限；502/503 上游不可用。
- semantic_search 的 filters 为软语义：缺失元数据的 chunk 不会被排除，结论需注明范围为近似；唯一例外是 doc_id（硬召回约束）。
