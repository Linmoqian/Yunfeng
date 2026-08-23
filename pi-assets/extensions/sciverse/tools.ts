import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { sciverseFetch, sciverseRequest, stringEnum, truncate } from "./api.ts";

// ============================================================================
// search_papers：按结构化条件检索学术文献元数据
// ============================================================================

const searchPapersParams = Type.Object({
	query: Type.Optional(
		Type.String({ description: "BM25 全文关键词，匹配标题/摘要/期刊名/关键词；留空则纯结构化过滤" }),
	),
	collection: Type.Optional(
		stringEnum(["papers", "authors", "sources"], {
			description:
				"检索实体集合，默认 papers；查 authors/sources 时用 filters_advanced + list_catalog 对应字段（如 orcid、issn）",
		}),
	),
	title_contains: Type.Optional(Type.String({ description: "标题中必须包含的词" })),
	abstract_contains: Type.Optional(Type.String({ description: "摘要中必须包含的词" })),
	authors: Type.Optional(Type.Array(Type.String(), { description: "作者名，任一命中即可" })),
	year_from: Type.Optional(Type.Number({ description: "起始发表年（含）" })),
	year_to: Type.Optional(Type.Number({ description: "结束发表年（含）" })),
	journals: Type.Optional(Type.Array(Type.String(), { description: "期刊/会议规范化名，任一命中即可" })),
	subjects: Type.Optional(Type.Array(Type.String(), { description: "学科分类，如 computer science" })),
	filters_advanced: Type.Optional(
		Type.Array(
			Type.Object({
				field: Type.String({
					description: "过滤字段名（可用 list_catalog 查询）；如 references_unique_id 用于引文反查",
				}),
				operator: Type.Optional(
					stringEnum(
						[
							"FILTER_OP_EQ",
							"FILTER_OP_NE",
							"FILTER_OP_GT",
							"FILTER_OP_GTE",
							"FILTER_OP_LT",
							"FILTER_OP_LTE",
							"FILTER_OP_IN",
							"FILTER_OP_NIN",
							"FILTER_OP_CONTAINS",
							"FILTER_OP_MATCH",
							"FILTER_OP_MATCH_PHRASE",
						],
						{ description: "过滤操作符，默认 FILTER_OP_EQ" },
					),
				),
				value: Type.Unknown({ description: "过滤值" }),
			}),
			{ description: "高级过滤，仅当便捷字段不够时使用" },
		),
	),
	sort_by_year: Type.Optional(stringEnum(["desc", "asc", "none"], { description: "按年份排序，默认 desc" })),
	sort_advanced: Type.Optional(
		Type.Array(
			Type.Object({
				field: Type.String({ description: "可排序字段名（用 list_catalog 查询）" }),
				order: Type.Optional(
					stringEnum(["SORT_ORDER_DESC", "SORT_ORDER_ASC"], { description: "排序方向，默认 SORT_ORDER_DESC" }),
				),
			}),
			{ description: "高级排序逃生舱，按任意可排序字段排序；与 sort_by_year 互斥" },
		),
	),
	page: Type.Optional(Type.Number({ description: "页码，默认 1" })),
	page_size: Type.Optional(Type.Number({ description: "每页条数，默认 25，范围 1-200" })),
	cursor: Type.Optional(
		Type.String({
			description:
				"游标深翻页（来自上一次响应 next_cursor）；与 page > 1 互斥。翻越 page×page_size=10000 时用 cursor",
		}),
	),
	freshness_boost: Type.Optional(
		stringEnum(["NONE", "MILD", "STRONG"], {
			description:
				"时效性加权（仅 query 非空且未显式 sort 时生效）：MILD=10 年衰减，STRONG=3 年衰减；启用时仅浅分页（无 cursor）",
		}),
	),
	impact_boost: Type.Optional(
		stringEnum(["NONE", "MILD", "STRONG"], {
			description:
				"影响力加权（仅 query 非空且未显式 sort 时生效）：MILD=轻微，STRONG=强烈偏重高被引；启用时仅浅分页（无 cursor）",
		}),
	),
	language_affinity: Type.Optional(
		stringEnum(["NONE", "MILD", "STRONG"], {
			description: "语言亲和加权（仅 query 非空且未显式 sort 时生效）：非目标语言降权；启用时仅浅分页（无 cursor）",
		}),
	),
	fields: Type.Optional(
		Type.Array(Type.String(), {
			description:
				'指定返回字段（如 ["doc_id","title"]）；不传返回默认字段（见 list_catalog.default_fields）。' +
				"硬范围检索时先只投影 doc_id，再交给 semantic_search 的 filters.doc_id。",
		}),
	),
});

interface PaperAuthor {
	name?: string;
	orcid?: string;
}

interface PaperMetadata {
	unique_id: string;
	doc_id?: string;
	is_content_accessible?: boolean;
	title?: string;
	author?: PaperAuthor[];
	abstract?: string;
	publication_venue_name_unified?: string;
	publication_published_year?: number;
	subjects?: string[];
	keywords?: string[];
	doi?: string;
	citation_count?: number;
}

interface SearchPapersResponse {
	results: PaperMetadata[];
	total_count: number;
	page: number;
	page_size: number;
	total_pages?: number;
	search_time_ms?: number;
	next_cursor?: string;
}

function formatPaper(paper: PaperMetadata, index: number): string {
	const authors = (paper.author ?? [])
		.map((author) => author.name ?? "")
		.filter((name) => name.length > 0)
		.join(", ");
	const meta = [
		paper.publication_venue_name_unified,
		paper.publication_published_year !== undefined ? String(paper.publication_published_year) : undefined,
		authors,
		paper.citation_count !== undefined ? `被引 ${paper.citation_count}` : undefined,
		`unique_id: ${paper.unique_id}`,
		paper.doc_id ? `doc_id: ${paper.doc_id}` : undefined,
		paper.doi ? `doi: ${paper.doi}` : undefined,
		paper.is_content_accessible !== undefined ? `全文可读: ${paper.is_content_accessible ? "是" : "否"}` : undefined,
	]
		.filter((part): part is string => part !== undefined && part.length > 0)
		.join(" | ");
	const lines = [`${index}. ${paper.title ?? "(无标题)"}`, meta];
	if (paper.abstract) {
		lines.push(`   摘要: ${truncate(paper.abstract, 400)}`);
	}
	return lines.join("\n");
}

interface BackendFilter {
	field: string;
	operator: string;
	value: unknown;
}

interface BackendSort {
	field: string;
	order: "SORT_ORDER_DESC" | "SORT_ORDER_ASC";
}

/**
 * 按官方 TS SDK（AgentToolsClient.toBackendPayload）把便捷参数映射为后端
 * 实际接受的 filters / sort 数组。部署中的后端为严格 schema：
 * year_from、authors、filters_advanced 等便捷字段不能直接透传（返回 400
 * extra_forbidden），必须映射为 filters；排序映射为 sort。
 */
function buildSearchPapersBody(params: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of [
		"query",
		"page",
		"page_size",
		"fields",
		"collection",
		"cursor",
		"freshness_boost",
		"impact_boost",
		"language_affinity",
	]) {
		if (params[key] !== undefined) {
			out[key] = params[key];
		}
	}

	const filters: BackendFilter[] = [];
	if (params.title_contains !== undefined) {
		filters.push({ field: "title", operator: "FILTER_OP_CONTAINS", value: params.title_contains });
	}
	if (params.abstract_contains !== undefined) {
		filters.push({ field: "abstract", operator: "FILTER_OP_CONTAINS", value: params.abstract_contains });
	}
	if (Array.isArray(params.authors) && params.authors.length > 0) {
		filters.push({ field: "author", operator: "FILTER_OP_IN", value: params.authors });
	}
	if (params.year_from !== undefined) {
		filters.push({ field: "publication_published_year", operator: "FILTER_OP_GTE", value: params.year_from });
	}
	if (params.year_to !== undefined) {
		filters.push({ field: "publication_published_year", operator: "FILTER_OP_LTE", value: params.year_to });
	}
	if (Array.isArray(params.journals) && params.journals.length > 0) {
		filters.push({
			field: "publication_venue_name_unified",
			operator: "FILTER_OP_IN",
			value: params.journals,
		});
	}
	if (Array.isArray(params.subjects) && params.subjects.length > 0) {
		filters.push({ field: "subjects", operator: "FILTER_OP_IN", value: params.subjects });
	}
	if (Array.isArray(params.filters_advanced)) {
		for (const item of params.filters_advanced as BackendFilter[]) {
			filters.push({ field: item.field, operator: item.operator ?? "FILTER_OP_EQ", value: item.value });
		}
	}
	if (filters.length > 0) {
		out.filters = filters;
	}

	const sort: BackendSort[] = [];
	if (params.sort_by_year === "desc" || params.sort_by_year === "asc") {
		sort.push({
			field: "publication_published_year",
			order: params.sort_by_year === "desc" ? "SORT_ORDER_DESC" : "SORT_ORDER_ASC",
		});
	}
	if (Array.isArray(params.sort_advanced)) {
		for (const item of params.sort_advanced as Array<{ field?: string; order?: string }>) {
			if (item?.field) {
				sort.push({
					field: item.field,
					order: item.order === "SORT_ORDER_ASC" ? "SORT_ORDER_ASC" : "SORT_ORDER_DESC",
				});
			}
		}
	}
	if (sort.length > 0) {
		out.sort = sort;
	}

	return out;
}

/**
 * agentic-search 请求体仅透传官方文档定义的字段（query / top_k / sub_queries /
 * filters），未定义字段不发送，避免把已废弃的 mode/retrieval 带入请求。
 */
function buildSemanticSearchBody(params: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of ["query", "top_k", "sub_queries", "filters"]) {
		if (params[key] !== undefined) {
			out[key] = params[key];
		}
	}
	return out;
}

// ============================================================================
// semantic_search：自然语言语义检索（RAG 用）
// ============================================================================

const semanticSearchParams = Type.Object({
	query: Type.String({ description: "自然语言查询，≤4096 字符，非空" }),
	top_k: Type.Optional(
		Type.Number({ description: "返回条数上限，默认 10，范围 1-100；未启用 sub_queries 时实际约 50 条" }),
	),
	sub_queries: Type.Optional(
		Type.Number({ description: "查询改写路数，0 禁用（默认 0），范围 0-4；>0 合并多路召回可超过 50 条" }),
	),
	filters: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description:
				"结构化过滤：lang、title、author、publication_venue_name_unified、publication_venue_type、publication_published_date/year、citation_count、influential_citation_count、topics（{logic,dimensions}）等均为软语义（缺失元数据的 chunk 不被排除）；" +
				"唯一例外 doc_id（64 位小写 hex，string 或数组）是硬召回约束：命中不越出该集合，去重上限 1000（超限 400 SCOPE_TOO_LARGE），" +
				"空数组返回空 hits（不退化为全局检索）。多个字段之间 AND，同一字段数组内 OR。",
		}),
	),
});

interface SearchChunk {
	chunk_id: string;
	doc_id: string;
	title?: string;
	abstract?: string;
	chunk?: string;
	score: number;
	offset: number;
	page_no?: number;
	source_type?: string;
}

interface SemanticSearchResponse {
	hits: SearchChunk[];
}

function formatChunk(chunk: SearchChunk, index: number): string {
	const lines = [
		`[${index + 1}] (score ${chunk.score.toFixed(3)}) ${chunk.title ?? "(无标题)"}`,
		`   doc_id: ${chunk.doc_id} | offset: ${chunk.offset} | chunk_id: ${chunk.chunk_id}`,
	];
	if (chunk.chunk) {
		lines.push(`   ${truncate(chunk.chunk, 600)}`);
	}
	return lines.join("\n");
}

// ============================================================================
// read_content：按字节区间读取文献原文片段
// ============================================================================

const readContentParams = Type.Object({
	doc_id: Type.String({
		description: "文献 doc_id（来自 search_papers / semantic_search；仅全文可读的论文才有）",
	}),
	offset: Type.Optional(Type.Number({ description: "字节偏移，默认 0；来自 semantic_search 的 offset" })),
	limit: Type.Optional(Type.Number({ description: "读取字节数，默认 4096，最大 16384" })),
});

interface ReadContentResponse {
	text: string;
	bytes_returned: number;
	next_offset: number;
	more: boolean;
}

// ============================================================================
// list_catalog：列出可用字段、能否过滤/排序、枚举值样本
// ============================================================================

const listCatalogParams = Type.Object({
	collection: Type.Optional(
		stringEnum(["papers", "authors", "sources"], { description: "字段 catalog 所属实体集合，默认 papers" }),
	),
	include_sample_values: Type.Optional(Type.Boolean({ description: "是否返回枚举字段取值样本（默认 false）" })),
});

interface FieldCatalogEntry {
	name: string;
	type: string;
	filterable: boolean;
	sortable: boolean;
	searchable: boolean;
	default_returned: boolean;
	description?: string;
	sample_values?: string[];
	operators?: string[];
}

interface CatalogResponse {
	fields: FieldCatalogEntry[];
	default_fields?: string[];
	filter_operators?: string[];
}

// ============================================================================
// list_paper_relations：分页查一篇论文的引用/被引/相关工作
// ============================================================================

const listPaperRelationsParams = Type.Object({
	unique_id: Type.String({
		description: "目标论文 unique_id（来自 search_papers / semantic_search；勿传 doc_id）",
	}),
	relation: stringEnum(["CITATIONS", "REFERENCES", "RELATED_WORKS"], {
		description: "CITATIONS=被引（谁引用了我）；REFERENCES=参考文献（我引用了谁）；RELATED_WORKS=相关工作",
	}),
	page: Type.Optional(Type.Number({ description: "页码，默认 1" })),
	page_size: Type.Optional(Type.Number({ description: "每页条数，默认 25，最大 200" })),
});

interface RelationItem {
	id: string;
	id_type?: string;
	title?: string;
}

interface PaperRelationsResponse {
	items: RelationItem[];
	total_count?: number;
	page?: number;
	page_size?: number;
	total_pages?: number;
}

// ============================================================================
// get_resource：取文献附属图片（Figure / Table 等）
// ============================================================================

const getResourceParams = Type.Object({
	file_name: Type.String({
		description: "图片相对路径，来自 read_content Markdown 中的 ![alt](file_name)；禁止 ..、\\ 或以 / 开头",
	}),
});

function validateFileName(fileName: string): void {
	if (fileName.startsWith("/") || fileName.includes("..") || fileName.includes("\\")) {
		throw new Error(`非法的 file_name: ${fileName}（禁止绝对路径、.. 与 \\）`);
	}
}

// ============================================================================
// 注册
// ============================================================================

export function registerSciverseTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "search_papers",
		label: "SciVerse 检索文献",
		description:
			"按结构化条件检索学术文献元数据（标题、作者、期刊、年份、学科等）。" +
			"适用：查某作者/期刊/年份范围的论文。自然语言问答检索请用 semantic_search。" +
			"返回论文列表：unique_id（始终存在）、doc_id（仅全文可读时存在）、is_content_accessible、citation_count 等。" +
			"结构化参数（作者/年份/期刊等）由扩展映射为后端 filters/sort（官方 TS SDK 兼容）。",
		promptSnippet: "检索学术文献元数据（结构化条件：作者/期刊/年份/标题等）",
		promptGuidelines: [
			"查文献元数据用 search_papers；自然语言 RAG 检索用 semantic_search；读全文用 read_content。",
			"read_content 前先确认论文 is_content_accessible 为 true 且存在 doc_id。",
			"引用文献时在回答中标注标题与 doc_id/unique_id。",
		],
		parameters: searchPapersParams,
		async execute(_toolCallId, params, signal) {
			const data = await sciverseRequest<SearchPapersResponse>(
				"/meta-search",
				{ method: "POST", body: buildSearchPapersBody(params as Record<string, unknown>) },
				signal,
			);
			const start = (data.page - 1) * data.page_size + 1;
			const lines = data.results.map((paper, index) => formatPaper(paper, start + index));
			const header = params.cursor
				? `共 ${data.total_count} 篇（cursor 翻页，每页 ${data.page_size} 条；下一页 cursor: ${data.next_cursor ?? "无"}）`
				: `共 ${data.total_count} 篇（第 ${data.page} 页，每页 ${data.page_size} 条）`;
			return {
				content: [{ type: "text", text: [header, ...lines].join("\n\n") }],
				details: {
					tool: "search_papers",
					totalCount: data.total_count,
					page: data.page,
				},
			};
		},
	});

	pi.registerTool({
		name: "semantic_search",
		label: "SciVerse 语义检索",
		description:
			"自然语言语义检索学术文献，返回相关全文片段（chunk）用于 RAG 回答。" +
			"典型链路：semantic_search → 选中 chunk → read_content(doc_id, offset) 扩展上下文。" +
			"返回每条含 doc_id、offset、score、chunk。精确字段过滤用 search_papers。",
		promptSnippet: "自然语言语义检索学术文献片段（RAG）",
		promptGuidelines: [
			"回答文献问题时先用 semantic_search 检索，再按需 read_content 扩展上下文。",
			"引用片段时标注论文标题与 doc_id。",
		],
		parameters: semanticSearchParams,
		async execute(_toolCallId, params, signal) {
			const body = buildSemanticSearchBody(params as Record<string, unknown>);
			const data = await sciverseRequest<SemanticSearchResponse>(
				"/agentic-search",
				{ method: "POST", body },
				signal,
			);
			const lines = data.hits.map((chunk, index) => formatChunk(chunk, index));
			const guidance =
				"\n\n选中片段后可调用 read_content(doc_id, offset) 读取更多上下文；回答中请标注论文标题与 doc_id。";
			return {
				content: [{ type: "text", text: (lines.length > 0 ? lines.join("\n\n") : "无命中。") + guidance }],
				details: { tool: "semantic_search", hitCount: data.hits.length },
			};
		},
	});

	pi.registerTool({
		name: "read_content",
		label: "SciVerse 读取原文",
		description:
			"按字节区间读取文献原文片段。通常配合 semantic_search 返回的 doc_id/offset 使用，" +
			"用于扩展上下文（往前/往后读更多字节）。返回 text、bytes_returned、next_offset、more。",
		promptSnippet: "读取文献原文片段（按 doc_id 与字节偏移）",
		parameters: readContentParams,
		async execute(_toolCallId, params, signal) {
			const offset = params.offset ?? 0;
			const data = await sciverseRequest<ReadContentResponse>(
				"/content",
				{ query: { doc_id: params.doc_id, offset, limit: params.limit } },
				signal,
			);
			const lines = [
				`已读取 ${data.bytes_returned} 字节（offset ${offset} 起）：`,
				data.text,
				data.more
					? `\n[还有后续] 可调用 read_content(doc_id="${params.doc_id}", offset=${data.next_offset}) 继续。`
					: "",
			];
			return {
				content: [{ type: "text", text: lines.filter((line) => line.length > 0).join("\n\n") }],
				details: {
					tool: "read_content",
					docId: params.doc_id,
					bytesReturned: data.bytes_returned,
					nextOffset: data.next_offset,
					more: data.more,
				},
			};
		},
	});

	pi.registerTool({
		name: "list_catalog",
		label: "SciVerse 字段目录",
		description:
			"返回 search_papers 可用字段的 catalog：字段名、类型、能否过滤/排序、是否默认返回、字段说明、FilterOperator 清单。" +
			"首次接触 Sciverse 或遇到模糊字段需求时先调用本工具，再精确构造 search_papers 的 filters_advanced。",
		promptSnippet: "查询 SciVerse 可用字段与枚举值目录",
		parameters: listCatalogParams,
		async execute(_toolCallId, params, signal) {
			const data = await sciverseRequest<CatalogResponse>(
				"/meta-catalog",
				{
					query: {
						collection: params.collection,
						include_sample_values: params.include_sample_values,
					},
				},
				signal,
			);
			const lines = data.fields.map((field) => {
				const flags = [
					field.filterable ? "可过滤" : undefined,
					field.sortable ? "可排序" : undefined,
					field.searchable ? "可搜索" : undefined,
					field.default_returned ? "默认返回" : undefined,
				]
					.filter((flag): flag is string => flag !== undefined)
					.join("/");
				const parts = [`${field.name} (${field.type}) ${flags}`];
				if (field.description) parts.push(`   ${field.description}`);
				if (field.sample_values && field.sample_values.length > 0) {
					parts.push(`   样本: ${field.sample_values.slice(0, 10).join(", ")}`);
				}
				if (field.operators && field.operators.length > 0) {
					parts.push(`   操作符: ${field.operators.join(", ")}`);
				}
				return parts.join("\n");
			});
			const footer =
				data.filter_operators && data.filter_operators.length > 0
					? `\n\n支持的操作符: ${data.filter_operators.join(", ")}`
					: "";
			return {
				content: [{ type: "text", text: lines.join("\n\n") + footer }],
				details: { tool: "list_catalog", fieldCount: data.fields.length, collection: params.collection },
			};
		},
	});

	pi.registerTool({
		name: "list_paper_relations",
		label: "SciVerse 引用关系",
		description:
			"分页返回某篇论文的引用/被引/相关工作列表。CITATIONS=被引（谁引用了我）；REFERENCES=参考文献（我引用了谁）；" +
			"RELATED_WORKS=相关工作。typical 链路：先 search_papers / semantic_search 拿 unique_id，再按 relation 分页。",
		promptSnippet: "查询论文的引用/被引/相关工作列表",
		parameters: listPaperRelationsParams,
		async execute(_toolCallId, params, signal) {
			const data = await sciverseRequest<PaperRelationsResponse>(
				"/meta-paper-relations",
				{
					method: "POST",
					body: {
						unique_id: params.unique_id,
						relation: params.relation,
						page: params.page,
						page_size: params.page_size,
					},
				},
				signal,
			);
			const lines = data.items.map(
				(item, index) => `${index + 1}. ${item.title ?? item.id} (${item.id_type ?? item.id})`,
			);
			const header = `共 ${data.total_count ?? "?"} 条（第 ${data.page ?? 1} 页 / 共 ${data.total_pages ?? "?"} 页）`;
			return {
				content: [{ type: "text", text: [header, ...lines].join("\n") }],
				details: { tool: "list_paper_relations", totalCount: data.total_count, page: data.page },
			};
		},
	});

	pi.registerTool({
		name: "get_resource",
		label: "SciVerse 读取图片",
		description:
			"读取文献中嵌入的图片（Figure/Table）字节流。触发场景：read_content 返回的 Markdown 中含 " +
			"![alt](file_name) 形式的图片占位，用户需要看图时调用。file_name 来自 Markdown 的 url 段（相对路径）。",
		promptSnippet: "读取文献内嵌图片（Figure/Table）",
		parameters: getResourceParams,
		async execute(_toolCallId, params, signal) {
			validateFileName(params.file_name);
			const response = await sciverseFetch(
				"/resource",
				{ query: { file_name: params.file_name }, headers: { Accept: "image/*" } },
				signal,
			);
			const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
			const bytes = Buffer.from(await response.arrayBuffer());
			return {
				content: [
					{ type: "text", text: `已获取图片 ${params.file_name}（${bytes.length} 字节，${mimeType}）。` },
					{ type: "image", data: bytes.toString("base64"), mimeType },
				],
				details: { tool: "get_resource", fileName: params.file_name, bytes: bytes.length, mimeType },
			};
		},
	});
}
