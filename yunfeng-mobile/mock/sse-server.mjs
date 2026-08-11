// 开发用 mock sidecar：与 app/sidecar 的 REST + SSE 协议对齐，
// 供浏览器端验证流式对话（真实移动端 sidecar 接入方案待定）。
// 启动：npm run mock   （默认 127.0.0.1:1424，可用 MOCK_PORT 覆盖）

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 1424);
const sessions = new Map(); // id -> { id, file, cwd, subscribers: Set<res>, timers: Set }

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-Pi-Token, Content-Type");
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function createSession(cwd) {
  const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
  const session = { id, file: `~/.pi/agent/sessions/${id}.jsonl`, cwd, subscribers: new Set(), timers: new Set() };
  sessions.set(id, session);
  return session;
}

function sseSend(session, event) {
  for (const res of session.subscribers) res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function schedule(session, ms, fn) {
  const timer = setTimeout(() => {
    session.timers.delete(timer);
    fn();
  }, ms);
  session.timers.add(timer);
}

function clearTimers(session) {
  for (const timer of session.timers) clearTimeout(timer);
  session.timers.clear();
}

// 演示 prompt 的完整事件序列（两个工具：一个成功、一个失败）
function runDemoPrompt(session, prompt) {
  const text = `已收到「${prompt}」。

演示内容：
- 工具「任务拆解」执行成功
- 工具「代码审查」因未提交改动而失败
- thinking 区块在流式生成时自动展开

接入真实 sidecar 后，这里会返回真实执行结果。`;
  const half = Math.ceil(text.length / 2);
  const thinking = "先理解需求，再拆解为可执行步骤：1) 建立会话；2) 订阅事件流；3) 渲染增量内容。";

  schedule(session, 80, () =>
    sseSend(session, {
      type: "agent_update",
      agentId: "lead",
      status: "working",
      activity: "正在拆解「代码审查」任务",
    }),
  );
  schedule(session, 90, () =>
    sseSend(session, { type: "agent_update", agentId: "code", status: "working", activity: "执行代码审查" }),
  );
  schedule(session, 100, () =>
    sseSend(session, { type: "agent_update", agentId: "test", status: "working", activity: "正在准备测试环境" }),
  );
  schedule(session, 150, () =>
    sseSend(session, { type: "tool_execution_start", toolCallId: "t-decompose", toolName: "任务拆解" }),
  );
  schedule(session, 300, () =>
    sseSend(session, { type: "tool_execution_update", toolCallId: "t-decompose", message: "正在拆解为 3 个子任务…" }),
  );
  schedule(session, 450, () =>
    sseSend(session, {
      type: "message_update",
      message: { role: "assistant", content: [{ type: "thinking", thinking }] },
    }),
  );
  schedule(session, 700, () =>
    sseSend(session, { type: "tool_execution_start", toolCallId: "t-review", toolName: "代码审查" }),
  );
  schedule(session, 900, () =>
    sseSend(session, { type: "tool_execution_update", toolCallId: "t-review", message: "扫描变更文件…" }),
  );
  schedule(session, 1100, () =>
    sseSend(session, {
      type: "message_update",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking },
          { type: "text", text: text.slice(0, half) },
        ],
      },
    }),
  );
  schedule(session, 1500, () =>
    sseSend(session, {
      type: "message_update",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking },
          { type: "text", text },
        ],
      },
    }),
  );
  schedule(session, 1700, () =>
    sseSend(session, { type: "tool_execution_end", toolCallId: "t-decompose", result: "已拆解 3 个子任务" }),
  );
  schedule(session, 1900, () =>
    sseSend(session, {
      type: "tool_execution_error",
      toolCallId: "t-review",
      errorMessage: "工作区存在未提交改动，需先处理",
    }),
  );
  schedule(session, 2100, () =>
    sseSend(session, {
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking },
          { type: "text", text },
        ],
        timestamp: new Date().toISOString(),
      },
    }),
  );
  schedule(session, 150, () =>
    sseSend(session, {
      type: "task_plan",
      tasks: [
        { id: "task-1", title: "分析需求与上下文" },
        { id: "task-2", title: "制定执行方案" },
        { id: "task-3", title: "调用工具执行" },
        { id: "task-4", title: "汇总结果" },
      ],
    }),
  );
  schedule(session, 500, () =>
    sseSend(session, { type: "task_update", taskId: "task-1", status: "done" }),
  );
  schedule(session, 900, () =>
    sseSend(session, { type: "task_update", taskId: "task-2", status: "running", detail: "执行中…" }),
  );
  schedule(session, 1300, () =>
    sseSend(session, { type: "task_update", taskId: "task-2", status: "done" }),
  );
  schedule(session, 1600, () =>
    sseSend(session, { type: "task_update", taskId: "task-3", status: "running", detail: "执行中…" }),
  );
  schedule(session, 2000, () => {
    sseSend(session, { type: "task_update", taskId: "task-3", status: "done" });
    sseSend(session, { type: "task_update", taskId: "task-4", status: "running", detail: "执行中…" });
  });
  schedule(session, 2150, () =>
    sseSend(session, { type: "task_update", taskId: "task-4", status: "done" }),
  );
  schedule(session, 2200, () => {
    sseSend(session, { type: "agent_end" });
    sseSend(session, { type: "agent_update", agentId: "lead", status: "idle", activity: "空闲" });
    sseSend(session, { type: "agent_update", agentId: "code", status: "idle", activity: "空闲" });
    sseSend(session, { type: "agent_update", agentId: "test", status: "idle", activity: "空闲" });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && path === "/api/health") {
    return json(res, 200, { ok: true, version: 1 });
  }
  if (req.method === "GET" && path === "/api/sessions") {
    return json(res, 200, { sessions: [] });
  }

  if (req.method === "POST" && path === "/api/rpc/start") {
    const body = await readBody(req);
    const session = createSession(body.cwd ?? "~");
    return json(res, 200, {
      sessionId: session.id,
      sessionFile: session.file,
      cwd: session.cwd,
    });
  }

  const contextMatch = path.match(/^\/api\/rpc\/([^/]+)\/context$/);
  if (req.method === "GET" && contextMatch) {
    const session = sessions.get(decodeURIComponent(contextMatch[1]));
    if (!session) return json(res, 404, { error: "Session not found" });
    return json(res, 200, {
      messages: [],
      entryIds: [],
      thinkingLevel: undefined,
      model: undefined,
    });
  }

  const eventsMatch = path.match(/^\/api\/rpc\/([^/]+)\/events$/);
  if (req.method === "GET" && eventsMatch) {
    const session = sessions.get(decodeURIComponent(eventsMatch[1]));
    if (!session) return json(res, 404, { error: "Session not found" });
    cors(res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    session.subscribers.add(res);
    res.write(`data: ${JSON.stringify({ type: "connected", sessionId: session.id })}\n\n`);
    req.on("close", () => session.subscribers.delete(res));
    return;
  }

  const commandMatch = path.match(/^\/api\/rpc\/([^/]+)\/command$/);
  if (req.method === "POST" && commandMatch) {
    const session = sessions.get(decodeURIComponent(commandMatch[1]));
    if (!session) return json(res, 404, { error: "Session not running" });
    const body = await readBody(req);
    switch (body.type) {
      case "prompt":
        clearTimers(session);
        runDemoPrompt(session, String(body.message ?? ""));
        return json(res, 200, { success: true });
      case "abort":
        clearTimers(session);
        return json(res, 200, { success: true });
      case "get_state":
        return json(res, 200, {
          sessionId: session.id,
          sessionFile: session.file,
          isStreaming: false,
          isPromptRunning: false,
          isBashRunning: false,
          isCompacting: false,
          autoCompactionEnabled: true,
          autoRetryEnabled: true,
          model: undefined,
          pendingMessageCount: 0,
          queuedMessages: { steering: [], followUp: [] },
          contextUsage: null,
          systemPrompt: "",
          thinkingLevel: "",
        });
      default:
        return json(res, 400, { error: `Unknown command: ${body.type}` });
    }
  }

  return json(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-sidecar] listening on http://127.0.0.1:${PORT}`);
});
