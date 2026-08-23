import { randomUUID } from "node:crypto";
import { Type } from "typebox";

export const SCIVERSE_BASE_URL = "https://api.sciverse.space";

/**
 * 本地 StringEnum 实现，等价于 @earendil-works/pi-ai 导出的 StringEnum：
 * 生成 { type: "string", enum: [...] } 的 schema，兼容 Google 等不支持
 * anyOf/const 模式的 provider。保持扩展自包含，避免对构建产物产生运行时依赖。
 */
export function stringEnum<T extends readonly string[]>(
	values: T,
	options?: { description?: string; default?: T[number] },
) {
	return Type.Unsafe<T[number]>({
		type: "string",
		enum: values as readonly string[],
		...(options?.description !== undefined && { description: options.description }),
		...(options?.default !== undefined && { default: options.default }),
	});
}

/** 读取并校验 SCIVERSE_API_TOKEN。 */
export function getToken(): string {
	const token = process.env.SCIVERSE_API_TOKEN?.trim();
	if (!token) {
		throw new Error(
			"未配置 SCIVERSE_API_TOKEN。请到 https://sciverse.space 控制台创建 Token（sci_ 开头），" +
				"设置环境变量 SCIVERSE_API_TOKEN 后重新加载扩展。",
		);
	}
	return token;
}

interface SciverseErrorBody {
	code?: string;
	message?: string;
	request_id?: string;
}

/** Sciverse API 返回非 2xx 时抛出的错误。 */
export class SciverseApiError extends Error {
	readonly status: number;
	readonly code: string | undefined;
	readonly requestId: string | undefined;

	constructor(status: number, code: string | undefined, message: string, requestId: string | undefined) {
		super(message);
		this.status = status;
		this.code = code;
		this.requestId = requestId;
	}
}

export interface SciverseRequestOptions {
	method?: "GET" | "POST";
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	headers?: Record<string, string>;
}

/** 发起带 Bearer 鉴权的请求；非 2xx 时解析 ApiError 并抛出 SciverseApiError。 */
export async function sciverseFetch(
	path: string,
	options: SciverseRequestOptions,
	signal?: AbortSignal,
): Promise<Response> {
	const url = new URL(path, SCIVERSE_BASE_URL);
	for (const [key, value] of Object.entries(options.query ?? {})) {
		if (value !== undefined) {
			url.searchParams.set(key, String(value));
		}
	}
	const token = getToken();
	let response: Response;
	try {
		response = await fetch(url, {
			method: options.method ?? "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
				"x-request-id": randomUUID(),
				"x-sciverse-source": "pi-extension",
				...(options.headers ?? {}),
			},
			body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
			signal,
		});
	} catch (error) {
		throw new Error(`Sciverse API 请求失败: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!response.ok) {
		let body: SciverseErrorBody | undefined;
		try {
			body = (await response.json()) as SciverseErrorBody;
		} catch {
			// 非 JSON 错误体，保留默认信息
		}
		const requestId = body?.request_id;
		throw new SciverseApiError(
			response.status,
			body?.code,
			body?.message ?? `Sciverse API 返回 ${response.status}`,
			requestId,
		);
	}
	return response;
}

/** 发起请求并解析 JSON 响应。 */
export async function sciverseRequest<T>(
	path: string,
	options: SciverseRequestOptions,
	signal?: AbortSignal,
): Promise<T> {
	const response = await sciverseFetch(path, options, signal);
	return (await response.json()) as T;
}

/** 截断长文本，保留前后边界信息。 */
export function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}...（已截断，共 ${text.length} 字符）`;
}
