// 从经过校验的官方发行包提取桌面端自带 Node 和许可证。
// Created on 2026-10-28
// @author: https://github.com/Linmoqian

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// 哈希取自 https://nodejs.org/en/blog/release/v22.23.4 的 SHASUMS。
const VERSION = "22.23.4";
const RELEASES = {
  "darwin-arm64": ["tar.gz", "c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428"],
  "darwin-x64": ["tar.gz", "efcc2b0db6f94bf53eddb038fe2b370277a042bd29e4f19b8f8e23598795b819"],
  "linux-arm64": ["tar.gz", "f7a1e486dbc8b286847815b477d4fb5e9fb963ed4489c3e1588853d685f589f9"],
  "linux-x64": ["tar.gz", "b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406"],
  "win32-arm64": ["zip", "a8b8cd79cbbb3062435f449591d98dd63730bbbf30ce2d7cc3a6376c236cb111"],
  "win32-x64": ["zip", "cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20"],
};

export function nodeRelease(platform = process.platform, arch = process.arch) {
  const entry = RELEASES[`${platform}-${arch}`];
  if (!entry) throw new Error(`不支持的 Node 运行时平台: ${platform}-${arch}`);
  const os = platform === "win32" ? "win" : platform;
  const root = `node-v${VERSION}-${os}-${arch}`;
  return { archive: `${root}.${entry[0]}`, sha256: entry[1], root, executable: platform === "win32" ? "node.exe" : "bin/node" };
}

export function verifyNodeArchive(data, expected) {
  if (createHash("sha256").update(data).digest("hex") !== expected) throw new Error("Node 发行包 SHA-256 校验失败");
}

/** 仅创建新的目标目录；失败时回收本次创建的文件，不覆盖现有运行时。 */
export function stageNodeRuntime(archivePath, destination, platform = process.platform, arch = process.arch) {
  const release = nodeRelease(platform, arch);
  verifyNodeArchive(readFileSync(archivePath), release.sha256);
  const extract = (name) => execFileSync("tar", ["-xOf", archivePath, `${release.root}/${name}`], { maxBuffer: 200 * 1024 * 1024 });
  const binary = extract(release.executable);
  const license = extract("LICENSE");
  mkdirSync(destination);
  try {
    writeFileSync(join(destination, platform === "win32" ? "node.exe" : "node"), binary, { mode: 0o755, flag: "wx" });
    writeFileSync(join(destination, "LICENSE"), license, { flag: "wx" });
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}
