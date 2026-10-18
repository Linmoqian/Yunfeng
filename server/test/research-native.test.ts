/* Rust 文件客户端的背压、故障不重放与 execute 取消边界。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeResearchFiles, researchFileClient, type ResearchEnvelope } from "../src/research/native-files.js";
import { writeExecutionFile } from "../src/research/execution-files.js";
import { JobExecutor } from "../src/research/executor.js";
import type { Result } from "../src/research/types.js";

test("文件调用有界，错误释放容量，未启用原生能力时保留独立运行", async () => {
  assert.equal(nativeResearchFiles({}), undefined);
  assert.throws(() => nativeResearchFiles({ YUNFENG_RESEARCH_NATIVE: "1" }), /未配置/);
  assert.throws(() => nativeResearchFiles({ YUNFENG_RESEARCH_NATIVE: "invalid" }), /标识无效/);
  const releases: (() => void)[] = [], requests: ResearchEnvelope[] = [];
  const client = researchFileClient(async <T>(request: ResearchEnvelope) => {
    requests.push(request); await new Promise<void>((resolve) => releases.push(resolve)); return "text" as T;
  });
  const pending = Array.from({ length: 8 }, () => client.read("fixture", "data.json"));
  await assert.rejects(client.write("fixture", "data.json", "{}"), /容量已满/);
  releases.splice(0).forEach((release) => release());
  await Promise.all(pending);
  assert.equal(requests.length, 8);
  const again = client.read("fixture", "data.json"); releases.shift()!(); await again;
  const failed = researchFileClient(async () => { throw new Error("rejected"); });
  for (let i = 0; i < 9; i++) await assert.rejects(failed.read("fixture", "data.json"), /rejected/);
});

test("原生连接断开不重试、不回退写入；开始前取消无副作用", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-native-client-"));
  const before = { flag: process.env.YUNFENG_RESEARCH_NATIVE, port: process.env.YUNFENG_APP_PORT, token: process.env.YUNFENG_APP_TOKEN };
  let requests = 0;
  let cancelOnDispatch: AbortController | undefined;
  const server = createServer((socket) => socket.once("data", () => {
    requests++;
    if (cancelOnDispatch) { cancelOnDispatch.abort(); socket.end('{"result":null}\n'); }
    else socket.destroy();
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const jobs = new JobExecutor();
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    process.env.YUNFENG_RESEARCH_NATIVE = "1";
    process.env.YUNFENG_APP_PORT = String(address.port); process.env.YUNFENG_APP_TOKEN = "test-only";
    await assert.rejects(writeExecutionFile(root, "cancelled.json", "{}", AbortSignal.abort()));
    await assert.rejects(writeExecutionFile(root, "oversized.txt", "中".repeat(21846), new AbortController().signal), /64 KiB/);
    assert.equal(requests, 0);
    const result = await new Promise<Result>((resolve) => jobs.start("native-failure", root, { decision: "act", reason: "fault", steps: [{ action: "write_file", path: "out.json", content: "{}" }] }, async (value) => resolve(value)));
    assert.equal(result.status, "failed"); assert.match(result.output!, /连接/);
    assert.equal(requests, 1); await assert.rejects(readFile(join(root, "out.json")), { code: "ENOENT" });
    cancelOnDispatch = new AbortController();
    await assert.rejects(writeExecutionFile(root, "late-cancel.json", "{}", cancelOnDispatch.signal));
    assert.equal(requests, 2, "收到提交后取消不重放，也不误报成功");
  } finally {
    await jobs.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [name, value] of [["YUNFENG_RESEARCH_NATIVE", before.flag], ["YUNFENG_APP_PORT", before.port], ["YUNFENG_APP_TOKEN", before.token]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
