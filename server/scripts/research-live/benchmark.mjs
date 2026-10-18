/* 真实模型验收的受控压缩实验；产物只能由此命令生成。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

const root = ".lin/experiments/";
const control = JSON.parse(readFileSync("control.json", "utf8"));
const config = JSON.parse(readFileSync(root + "config/config.json", "utf8"));
assert.equal(control.ready, true);
assert.ok(["baseline", "optimize"].includes(config.stage));
assert.ok(Number.isInteger(config.level) && config.level >= 1 && config.level <= 9);
const baselineStage = config.stage === "baseline";
const target = root + (baselineStage ? "baseline" : "report") + ".json";
assert.equal(existsSync(target), false, "已完成阶段不能重跑或覆盖");
if (baselineStage) assert.equal(config.level, 1);
else { assert.equal(control.reviewApproved, true); assert.ok(config.level > 1); }
const input = readFileSync("input.txt");
const compressed = gzipSync(input, { level: config.level });
const roundtrip = gunzipSync(compressed).equals(input);
const baseline = baselineStage ? undefined : JSON.parse(readFileSync(root + "baseline.json", "utf8"));
const improvement = baseline ? 100 * (1 - compressed.length / baseline.bytes) : 0;
const report = {
  stage: config.stage, level: config.level, inputBytes: input.length, bytes: compressed.length,
  sha256: createHash("sha256").update(input).digest("hex"), roundtrip, improvement,
  completed: !baselineStage && roundtrip && improvement >= 1 ? 1 : 0,
  summary: baselineStage ? `基线压缩为 ${compressed.length} 字节，解压一致：${roundtrip}`
    : `压缩为 ${compressed.length} 字节，较基线减小 ${improvement.toFixed(2)}%，解压一致：${roundtrip}`,
};
writeFileSync(root + config.stage + ".gz", compressed, { flag: "wx" });
writeFileSync(target, JSON.stringify(report, null, 2), { flag: "wx" });
appendFileSync("runs.log", config.stage + "\n");
console.log(JSON.stringify(report));
