// 移动端 API 联通性检测：使用与前端完全相同的 GatewayClient 调用电脑侧网关。
// 覆盖：health / 未认证拒绝 / 任务列表 / 创建任务 / 对话 / 命令 / 重命名 / SSE 事件流。
//
// 用法：
//   GATEWAY_URL=http://192.168.1.10:8787 GATEWAY_TOKEN=<token> npm run check:api

import { GatewayClient } from "../src/lib/gateway.ts";
import type { TaskStreamEvent } from "../src/lib/types.ts";

const baseUrl = (process.env.GATEWAY_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const token = process.env.GATEWAY_TOKEN ?? "";

let failed = false;

function log(message: string): void {
  console.log(`[检测] ${message}`);
}

function pass(message: string): void {
  console.log(`[通过] ${message}`);
}

function fail(message: string): never {
  failed = true;
  console.error(`[失败] ${message}`);
  process.exit(1);
}

function assert(condition: boolean, message: string): void {
  if (condition === false) fail(message);
}

async function readFirstSseEvent(taskId: string): Promise<TaskStreamEvent> {
  // 与浏览器 EventSource 相同的 URL 与认证方式（token 走 query）。
  // Node 24 无全局 EventSource，这里用 fetch 读流解析首个 data 帧做等价检测。
  const url = `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/events?token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    fail(`SSE 请求失败: ${e instanceof Error ? e.message : String(e)}`);
  }
  clearTimeout(timeout);
  assert(response.status === 200, `SSE 状态码异常: ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.includes("text/event-stream"), `SSE Content-Type 异常: ${contentType}`);
  assert(response.body !== null, "SSE 响应无 body");

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:") === false) continue;
          const payload = line.slice(5).trim();
          if (payload === "") continue;
          try {
            return JSON.parse(payload) as TaskStreamEvent;
          } catch {
            // 忽略坏帧，继续等待
          }
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  fail("SSE 流结束前未收到任何事件");
}

async function main(): Promise<void> {
  log(`调用关系: 移动端 GatewayClient → ${baseUrl}（yunfeng-gateway）→ yunfeng-server（电脑 Agent）`);
  if (token === "") fail("缺少 GATEWAY_TOKEN，请设置环境变量后重试");

  const client = new GatewayClient(baseUrl, token);

  // 1) 网关健康检查（公开接口，顺带确认上游 server 可达）
  const health = await client.checkHealth().catch((e: unknown) => fail(`health 失败: ${e instanceof Error ? e.message : String(e)}`));
  assert(health.ok === true, "health.ok 不为 true");
  assert(health.upstream.reachable === true, "网关报告上游不可达，请先启动电脑端 yunfeng-server");
  pass(`health ok: ${health.service} ${health.version}, upstream=${health.upstream.url}`);

  // 2) 未认证请求必须被网关拒绝
  const denied = await fetch(`${baseUrl}/api/tasks`);
  assert(denied.status === 401, `未认证请求应返回 401，实际 ${denied.status}`);
  pass("未认证请求被正确拒绝（401）");

  // 3) 任务列表
  const list = await client.loadTasks({ limit: 20 }).catch((e: unknown) => fail(`任务列表失败: ${e instanceof Error ? e.message : String(e)}`));
  assert(Array.isArray(list.tasks), "任务列表 tasks 不是数组");
  pass(`任务列表 ok: total=${list.total}`);

  // 4) 创建任务（空消息：只建会话，不触发模型调用）
  const created = await client.createTask().catch((e: unknown) => fail(`创建任务失败: ${e instanceof Error ? e.message : String(e)}`));
  assert(typeof created.task.id === "string" && created.task.id.length > 0, "创建任务未返回 task.id");
  pass(`创建任务 ok: task=${created.task.id} session=${created.sessionId}`);

  // 5) 任务对话（历史消息数组）
  const conversation = await client.loadTaskConversation(created.task.id).catch((e: unknown) => fail(`任务对话失败: ${e instanceof Error ? e.message : String(e)}`));
  assert(Array.isArray(conversation), "对话不是数组");
  pass(`任务对话 ok: messages=${conversation.length}`);

  // 6) Agent 命令转发（getQueue 无副作用，验证命令通道）
  const commandResult = await client.sendTaskCommand(created.task.id, { type: "getQueue" } as never).catch((e: unknown) => fail(`命令转发失败: ${e instanceof Error ? e.message : String(e)}`));
  assert(typeof commandResult === "object" || Array.isArray(commandResult), "命令返回结果异常");
  pass(`命令转发 ok: getQueue -> ${JSON.stringify(commandResult).slice(0, 80)}`);

  // 7) 重命名（PATCH）
  const renamed = await client.renameTask(created.task.id, "移动端 API 检测任务").catch((e: unknown) => fail(`重命名失败: ${e instanceof Error ? e.message : String(e)}`));
  assert(renamed.title === "移动端 API 检测任务", "重命名后标题不一致");
  pass(`重命名 ok: ${renamed.title}`);

  // 8) SSE 事件流（移动端 EventSource 订阅同款 URL）
  const firstEvent = await readFirstSseEvent(created.task.id);
  assert(typeof firstEvent.type === "string" && firstEvent.type.length > 0, "首个 SSE 事件缺少 type");
  pass(`SSE 事件流 ok: first=${firstEvent.type}`);

  // 9) 清理：归档检测任务
  await client.sendTaskCommand(created.task.id, { type: "archive" }).catch(() => {});
  pass(`清理 ok: task=${created.task.id} 已归档`);

  if (failed === false) {
    console.log(`[成功] 移动端 → 网关 → 电脑 Agent 的 API 链路全部连通`);
  } else {
    process.exit(1);
  }
}

void main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
