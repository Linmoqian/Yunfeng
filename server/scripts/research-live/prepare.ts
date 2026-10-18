/* 创建隔离项目，不拷贝模型凭据；两个验收进程共用其持久化目录。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("请提供一个尚不存在的独立验收目录");
await mkdir(root); // 拒绝复用已有实验，避免覆盖或把旧报告当作新结果。
const cwd = join(root, "project");
await mkdir(join(cwd, ".lin/experiments/config"), { recursive: true });
for (const name of ["gzip-study", "hidden-study", "experimental-design"]) {
  await mkdir(join(cwd, ".agents/skills", name), { recursive: true });
}
await writeFile(join(cwd, ".agents/skills/gzip-study/SKILL.md"), `---
name: gzip-study
description: Controlled baseline and optimization with exact byte validation
---
SELECTED_GZIP_LIVE_METHOD。先测 level=1 基线，再人工复核后选择更高 level 优化。
采用真实报告检验至少1%的压缩改善与解压字节一致；所有实验副作用通过 execute。
`);
await writeFile(join(cwd, ".agents/skills/hidden-study/SKILL.md"), `---
name: hidden-study
description: Unselected sentinel for resource isolation
---
HIDDEN_LIVE_SKILL_MUST_NOT_LOAD
`);
await copyFile(new URL("../../../.agents/skills/experimental-design/SKILL.md", import.meta.url), join(cwd, ".agents/skills/experimental-design/SKILL.md"));
await mkdir(join(cwd, ".lin/extensions"));
await writeFile(join(cwd, ".lin/extensions/unselected.ts"), `throw new Error("UNSELECTED_EXTENSION_MUST_NOT_RUN");`);
await copyFile(new URL("./benchmark.mjs", import.meta.url), join(cwd, "benchmark.mjs"));
await writeFile(join(cwd, "input.txt"), await readFile(new URL("../../src/research/runtime.ts", import.meta.url)));
await writeFile(join(cwd, "control.json"), JSON.stringify({ ready: false, reviewApproved: false }));
await writeFile(join(cwd, "README.md"), `# 源码压缩实验

唯一整体验收条件：{kind:"metric",path:".lin/experiments/report.json",key:"completed",operator:"==",value:1}。
先观察 control.json、.lin/experiments/baseline.json 和 .lin/experiments/report.json。
ready=false 必须 wait；未知 ready 也须 wait 并补充 observe_paths，不能执行。
ready=true 且基线不存在时，写配置 {"stage":"baseline","level":1}，再运行已授权 benchmark.mjs。
基线节点验收 {kind:"file_exists",path:".lin/experiments/baseline.json"}；执行完反思。
reviewApproved=false 时必须 wait 并观察 control.json，不创建可执行优化候选。
工程师会暂停、修改 reviewApproved 后恢复；复核通过才选择更高 gzip level 并写 {"stage":"optimize","level":所选整数}，执行同一命令。
优化节点验收与整体验收相同。不得改动整体条件。两阶段各运行一次，已完成节点沿用 ID 与目标，不重建或重跑。
唯一可写文件 .lin/experiments/config/config.json；报告、脚本、语料、日志、control.json 均只读。
命令程序必须使用 ${JSON.stringify(process.execPath)}，args=["benchmark.mjs"]，不能使用 shell。
每个执行计划均在运行命令后追加 update_component：component="research"，patch.source 指向本阶段 JSON。
报告字段：bytes(数值)、improvement(数值百分比)、completed(数值)、roundtrip(布尔)、summary(真实结论文本)。
patch.metrics=[{label:"压缩字节",key:"bytes",unit:"B"},{label:"减小幅度",key:"improvement",unit:"%"}]，patch.conclusion={summary:"summary"}。
实验数据都来自真实 gzip/解压对比，不预填结果，不自行修改指标或创建其他执行步骤。
`);
console.log(JSON.stringify({ status: "prepared", root }));
