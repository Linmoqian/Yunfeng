// 会话操作单测：cwd 回退与文件树同步逻辑。

import { describe, expect, it, vi } from "vitest";
import { openSessionAndSyncTree } from "./sessionActions";
import type { SessionInfo } from "./types";

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    path: "/tmp/s.jsonl",
    id: "s1",
    cwd: undefined,
    name: "s",
    created: "",
    modified: "",
    messageCount: 1,
    firstMessage: "hi",
    parentSessionId: undefined,
    projectRoot: undefined,
    ...overrides,
  };
}

describe("openSessionAndSyncTree", () => {
  it("cwd 为空时不执行任何操作", async () => {
    const openSession = vi.fn();
    const setRoot = vi.fn();
    await openSessionAndSyncTree(
      makeSession({ cwd: undefined, projectRoot: undefined }),
      { projectRoot: null },
      { openSession },
      { setRoot },
    );
    expect(openSession).not.toHaveBeenCalled();
    expect(setRoot).not.toHaveBeenCalled();
  });

  it("优先使用会话 cwd，并同步文件树根目录", async () => {
    const openSession = vi.fn().mockResolvedValue(undefined);
    const setRoot = vi.fn();
    await openSessionAndSyncTree(
      makeSession({ cwd: "/a", projectRoot: "/a" }),
      { projectRoot: "/b" },
      { openSession },
      { setRoot },
    );
    expect(openSession).toHaveBeenCalledWith(expect.anything(), "/a");
    expect(setRoot).toHaveBeenCalledWith("/a");
  });

  it("会话无 cwd 时回退到 sessions.projectRoot", async () => {
    const openSession = vi.fn().mockResolvedValue(undefined);
    const setRoot = vi.fn();
    await openSessionAndSyncTree(
      makeSession({ cwd: undefined, projectRoot: undefined }),
      { projectRoot: "/root" },
      { openSession },
      { setRoot },
    );
    expect(openSession).toHaveBeenCalledWith(expect.anything(), "/root");
  });

  it("文件树根目录不变时不重复 setRoot", async () => {
    const openSession = vi.fn().mockResolvedValue(undefined);
    const setRoot = vi.fn();
    await openSessionAndSyncTree(
      makeSession({ cwd: "/same" }),
      { projectRoot: "/same" },
      { openSession },
      { setRoot },
    );
    expect(openSession).toHaveBeenCalled();
    expect(setRoot).not.toHaveBeenCalled();
  });
});
