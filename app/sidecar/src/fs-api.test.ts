// 文件工作区 API 单测：路径穿越防护与目录/文件读取。

import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDir, readFileText, resolveInside } from "./fs-api";

const root = mkdtempSync(join(tmpdir(), "fs-api-test-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("resolveInside", () => {
  it("正常子路径解析到 root 内", () => {
    expect(resolveInside(root, "sub/dir")).toBe(join(root, "sub", "dir"));
  });

  it("空路径解析为 root 本身", () => {
    expect(resolveInside(root, "")).toBe(root);
  });

  it("拒绝 ../ 穿越", () => {
    expect(() => resolveInside(root, "../secret")).toThrow("Path escapes project root");
  });

  it("拒绝深层穿越", () => {
    expect(() => resolveInside(root, "a/../../secret")).toThrow("Path escapes project root");
  });

  it("拒绝绝对路径逃逸", () => {
    expect(() => resolveInside(root, "/etc/passwd")).toThrow("Path escapes project root");
  });

  it("拒绝 Windows 风格穿越", () => {
    expect(() => resolveInside(root, "..\\secret")).toThrow("Path escapes project root");
  });
});

describe("listDir", () => {
  it("过滤隐藏文件并按目录优先、名称排序", async () => {
    mkdirSync(join(root, "b-dir"), { recursive: true });
    writeFileSync(join(root, "a-file.txt"), "x");
    writeFileSync(join(root, ".hidden"), "x");
    const entries = await listDir(root, "");
    expect(entries.map((e) => e.name)).toEqual(["b-dir", "a-file.txt"]);
    expect(entries[0].type).toBe("dir");
    expect(entries[1].type).toBe("file");
  });
});

describe("readFileText", () => {
  it("读取文本文件并带截断标记", async () => {
    writeFileSync(join(root, "text.txt"), "hello");
    const result = await readFileText(root, "text.txt");
    expect(result).toEqual({ content: "hello", truncated: false });
  });

  it("二进制文件（含 NUL）返回占位描述", async () => {
    writeFileSync(join(root, "bin.dat"), Buffer.from([0x00, 0x01, 0x02]));
    const result = await readFileText(root, "bin.dat");
    expect(result.content).toMatch(/\[binary file, 3 bytes\]/);
  });

  it("目录路径读取报错", async () => {
    await expect(readFileText(root, "b-dir")).rejects.toThrow("Not a file");
  });

  it("越界路径读取报错", async () => {
    await expect(readFileText(root, "../secret")).rejects.toThrow("Path escapes project root");
  });
});
