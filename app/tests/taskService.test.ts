import assert from "node:assert/strict";
import test from "node:test";

import { browseDirectories } from "../src/services/taskService.ts";

test("browseDirectories 编码目录路径并返回可浏览目录", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      path: "/Volumes/base/My Project",
      parentPath: "/Volumes/base",
      directories: [
        { name: "src", path: "/Volumes/base/My Project/src" },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await browseDirectories("/Volumes/base/My Project");

  assert.equal(requestedUrl, "/api/cwd/browse?path=%2FVolumes%2Fbase%2FMy+Project");
  assert.equal(result.path, "/Volumes/base/My Project");
  assert.equal(result.parentPath, "/Volumes/base");
  assert.deepEqual(result.directories, [
    { name: "src", path: "/Volumes/base/My Project/src" },
  ]);
});

test("browseDirectories 未指定路径时从服务端默认目录开始", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      path: "/Users/lin",
      parentPath: "/Users",
      directories: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await browseDirectories();

  assert.equal(requestedUrl, "/api/cwd/browse");
});
