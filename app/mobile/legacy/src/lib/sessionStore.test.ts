import { describe, expect, it } from "vitest";
import {
  createSession,
  deleteSession,
  formatRelativeTime,
  renameSession,
  searchSessions,
  seedSessions,
  setArchived,
  sortSessions,
  touchSession,
  type MobileSession,
} from "./sessionStore";

function base(): MobileSession[] {
  return seedSessions();
}

describe("sessionStore", () => {
  it("种子会话迁移：演示数据转为本地会话", () => {
    const list = seedSessions();
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.every((s) => !s.archived)).toBe(true);
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
  });

  it("创建 / 重命名 / 触达", () => {
    let list = createSession(base(), { id: "n1", title: "新会话", snippet: "首条" });
    expect(list[0]).toMatchObject({ id: "n1", title: "新会话", snippet: "首条", messageCount: 1 });

    list = renameSession(list, "n1", " 审查登录流程 ");
    expect(list.find((s) => s.id === "n1")?.title).toBe("审查登录流程");

    list = touchSession(list, "n1", { snippet: "最新进展" });
    expect(list.find((s) => s.id === "n1")?.snippet).toBe("最新进展");
    expect(list.find((s) => s.id === "n1")!.updatedAt >= list.find((s) => s.id === "s1")!.updatedAt).toBe(true);
  });

  it("归档 / 恢复 / 删除", () => {
    let list = base();
    list = setArchived(list, "s1", true);
    expect(list.find((s) => s.id === "s1")?.archived).toBe(true);

    list = setArchived(list, "s1", false);
    expect(list.find((s) => s.id === "s1")?.archived).toBe(false);

    list = deleteSession(list, "s1");
    expect(list.some((s) => s.id === "s1")).toBe(false);
  });

  it("排序按 updatedAt 降序，搜索匹配标题与摘要", () => {
    const list = base();
    const sorted = sortSessions(list);
    expect(sorted[0].updatedAt >= sorted[sorted.length - 1].updatedAt).toBe(true);

    expect(searchSessions(list, "marvis").length).toBeGreaterThan(0);
    expect(searchSessions(list, "不存在的关键词")).toHaveLength(0);
    expect(searchSessions(list, "  ")).toHaveLength(list.length);
  });

  it("相对时间格式化", () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe("刚刚");
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5 分钟前");
    expect(formatRelativeTime(new Date(Date.now() - 2 * 3600_000).toISOString())).toBe("2 小时前");
  });
});
