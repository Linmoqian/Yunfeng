# 科研文献视界检索

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | execute / read_horizon / literature |
| 用途 | 公开查询、来源留存与双源候选筛选 |
| 调用方 | 科研 Pi 结构化计划 |
| 提供方 | TS JobExecutor、文献视界与既有文件执行器 |
| 稳定性 | 实验性，沿用现有计划、审批与 SSE，无新增网络服务 |
| 引入版本 | 2026-10-19 |
| 维护方 | server/src/research/literature |

索引依据：[Europe PMC REST](https://europepmc.org/RestfulWebService)、[Crossref REST](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)。SciVerse 官方入口要求账户 API Key，本机未配置，本版使用上述公共索引，不宣称有全文证据搜索能力。

## 请求

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| action | Plan.steps[] | string | 是 | — | read_horizon | 沿用视界核心工具 |
| domain | Plan.steps[] | string | 是 | — | literature | 其他视界不接收查询 |
| query | Plan.steps[] | string | 查询时是 | 无 | 1到300字符，无控制字符 | 仅公开研究问题，不含私密资料 |
| path | Plan.steps[] | string | 查询时是 | 无 | .lin/experiments/ 内 JSON 路径，仅字母数字下划线、短横线、目录分隔与 .json 后缀 | 宿主保存来源报告；不得为绝对路径、敏感文件或符号链接 |

query/path 必须同时提供；两者均省略时保持只读快照，不联网。查询步骤通过既有完整计划确认，展示接收方、查询文本和保存路径。与其他计划一样，必须给出 success_condition；达到候选数量只验收检索流程，不验收科学观点。

## 响应

结果以 JSON 行进入既有 Result.output，随 TaskStore 作业和节点持久化。文献视界可从已保存作业回执恢复摘要，资源材料元数据继续复用资源组件。

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| domain / available | string / boolean | 是 | literature / true | 检索步骤返回 |
| cached / path | boolean / string | 是 | — | 是否复用原报告、报告路径 |
| data.schemaVersion | number | 是 | 1 | 报告格式 |
| data.query / retrievedAt | string / string | 是 | 原查询 / ISO 时间 | 缓存保留原检索时间 |
| data.providers[] | object[] | 是 | 两项 | provider 与 status，部分失败显式保留 |
| data.sources[] | object[] | 是 | 最多6篇，优先有摘要者 | 按 DOI 或规范化标题合并，非空结果不保证相关性 |
| sources[].id / title / url | string | 是 | 标题最多240字符 | DOI 或索引身份，原作品可访问链接 |
| sources[].doi / year | string | 否 | — | 上游提供的作品标识和年份 |
| sources[].authors / authorKeys / authorsComplete | string[] / string[] / boolean | 是 | 最多32位作者 | 作者姓名、姓氏筛选键、是否完整 |
| sources[].excerpt / excerptTruncated / evidence | string / boolean / string | 是 | 最多1000字符 / abstract 或 metadata | 清除标签后的摘要节选；没有摘要不能支撑内容判断 |
| sources[].origins[] | object[] | 是 | provider/url/retrievedAt/sha256 | 索引请求地址、时间及原始条目 JSON 的 SHA-256，非全文哈希 |
| data.pairs[] | object[] | 是 | 最多10组 | sources 为两个作品 ID；status=candidate；basis 记录筛选依据 |
| data.source_count / independent_candidates | number | 是 | 0到6 / 0或2 | 去重作品数，以及是否找到至少一组有摘要且作者姓氏未重合的候选 |
| data.summary / details / limitations | string | 是 | 详情最多8000字符 | 简述、可点击来源 Markdown、证据局限 |
| data.digest | string | 是 | SHA-256 | 报告正文完整性校验，不能证明外部或本地资料真实 |

不同索引收录同一篇作品只算一源。候选配对不证明数据独立、论文不是预印本/发表版或结论成立；模型必须核对版本、转引、相关性和摘要，比较支持点、差异与适用范围。未读全文或证据不足须明确说明。来源文本不成为执行指令。

反思上下文只传递有界摘要、真实链接和候选组，不重复灌入完整回执。存在候选组时，宿主校验 summary 至少引用同一组的两篇实际来源，缺失引用沿用 Pi 的一次结构纠错，仍失败则暂停。该校验只核对引用归属，不自动证明比较正确。最终验收及服务重建后，文献视界继续复用已持久化的组件、节点报告来源。

## 错误码

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| LITERATURE_INPUT | 查询或路径不合法 | 修正后 | 提交公开查询与合法路径 |
| LITERATURE_CONFLICT | 已有报告损坏或属于不同查询 | 新路径 | 保留原报告，换新路径 |
| LITERATURE_UNAVAILABLE | 两个索引均失败 | 用户继续后 | 未写成功报告，无自动重试 |
| LITERATURE_HTTP_xxx | 单索引 HTTP 错误 | 视上游而定 | 作为 providers.status 保留，不能掩盖覆盖不足 |
| LITERATURE_RESPONSE_LIMIT / INVALID_RESPONSE / EMPTY_BODY | 单索引响应不合约 | 核实后 | 同上，不返回原始服务错误或私密配置 |
| TOOL_FORBIDDEN / AbortError | 授权失效或取消 | 重新授权后 | 复用现有暂停和取消机制，未知结果不重放 |

## 权限与安全

查询会离开本机，完整计划必须显式确认，不能继承只读视界或普通目录写入权限。批准只绑定原计划，改查询、改路径、暂停后不能复用。固定 HTTPS 公共索引地址，不接受模型 URL，不跟随重定向，不发送文件、凭据或任意请求头。查询公开性由调用者与确认者负责，本接口不提供秘密检测器或操作系统沙箱。

网络读取属于 horizon 仲裁；报告原子写入复用 Node/Rust 文件执行器并再次核对授权。没有新增 Tauri command/capability。文件路径继续受项目根、敏感资源和符号链接检查约束。

## 行为约束

两个固定索引并发各请求一次，每个最多6条；响应上限512000字节、单索引15秒超时，不自动重试。全部失败不保存报告，部分成功记录失败方，证据不足仍保存真实结果供核对。总作业时限与现有执行器一致。

同一报告路径的检索串行。同查询、同格式且摘要校验和一致时复用旧报告，不再次联网；报告没有自动 TTL，刷新使用新路径。校验和只检测意外损坏，本地报告仍可能被人为改写，不是来源真实性的签名。模型禁止写入检索报告。

暂停取消队列、在途网络读取与后续写入；原子提交之后取消可能已留下报告，恢复后通过同查询报告复用，不能称作撤销已经完成的副作用。工具反馈沿用 horizon 的 started/finished，文献数与双源候选沿用科研组件胶囊，来源与过程默认折叠。

## 调用示例

```json
{
  "decision": "act",
  "reason": "检索公开研究问题并保留双源候选",
  "steps": [
    {"action":"read_horizon","domain":"literature","query":"soybean pod detection deep learning","path":".lin/experiments/literature.json"},
    {"action":"update_component","component":"research","patch":{"source":".lin/experiments/literature.json","metrics":[{"label":"文献","key":"source_count"},{"label":"双源候选","key":"independent_candidates"}],"conclusion":{"summary":"summary","details":"details"}}}
  ],
  "success_condition": {"kind":"metric","path":".lin/experiments/literature.json","key":"independent_candidates","operator":">=","value":2}
}
```

## 兼容性与变更记录

兼容新增 read_horizon 的 query/path 可选字段；旧只读视界、工具权重与任务数据库不变。旧版本不了解新步骤字段，含检索的计划必须由支持本接口的版本恢复。核心测试 `server/test/research-literature.test.ts`；真实模型脚本见 `server/scripts/research-live/literature-live.ts`，默认测试不联网、不调用真实模型。
