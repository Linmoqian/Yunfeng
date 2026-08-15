// SSE 事件日志解析：跨 chunk 分帧、类型统计与关键事件识别。

import assert from "node:assert/strict";
import { test } from "node:test";
import { SseEventParser } from "../src/sse-log.ts";

test("跨 chunk 拼接后仍能解析完整 SSE 事件", () => {
  const parser = new SseEventParser();
  const first = parser.push('id: 1\ndata: {"type":"agent_st');
  assert.deepEqual(first, []);
  const second = parser.push('art","sessionId":"s1"}\n\ndata: {"type":"message_delta"}\n\n');
  assert.deepEqual(second.map((sample) => sample.type), ["agent_start", "message_delta"]);
  const summary = parser.finish();
  assert.equal(summary.events, 2);
  assert.equal(summary.keyEvents, 1);
  assert.deepEqual(summary.typeCounts, { agent_start: 1, message_delta: 1 });
});

test("忽略心跳注释与非 JSON 帧，不中断统计", () => {
  const parser = new SseEventParser();
  parser.push(":\n\n");
  parser.push("data: plain-text\n\n");
  parser.push('data: {"type":"run_failed"}\n\n');
  const summary = parser.finish();
  assert.equal(summary.events, 2);
  assert.equal(summary.keyEvents, 1);
  assert.equal(summary.typeCounts["run_failed"], 1);
});

test("flush 时解析残留在缓冲中的最后一帧", () => {
  const parser = new SseEventParser();
  parser.push('data: {"type":"agent_end"}');
  const summary = parser.finish();
  assert.equal(summary.events, 1);
  assert.equal(summary.typeCounts["agent_end"], 1);
});
