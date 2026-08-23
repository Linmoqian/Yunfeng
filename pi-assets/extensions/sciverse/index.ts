import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSciverseTools } from "./tools.ts";

/**
 * SciVerse 文献检索扩展。
 *
 * 注册 6 个工具（search_papers / semantic_search / read_content /
 * list_catalog / list_paper_relations / get_resource），并以 Skill
 * （sciverse-literature）提供使用指引（渐进式披露）。需要环境变量
 * SCIVERSE_API_TOKEN。
 */
export default function sciverseExtension(pi: ExtensionAPI) {
	registerSciverseTools(pi);
}
