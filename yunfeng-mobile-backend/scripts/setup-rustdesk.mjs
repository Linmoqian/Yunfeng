// 下载并准备内嵌的 RustDesk 官方构建产物（不提交二进制，目录已在 .gitignore）。
// 源码位于 vendor/rustdesk（固定 tag 1.4.9，AGPL-3.0），本脚本仅拉取官方 GitHub Release 产物。
//
// 用法：
//   node scripts/setup-rustdesk.mjs [--version 1.4.9] [--force]
// 成功输出：RUSTDESK_READY <可执行文件绝对路径>

import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN_DIR = join(ROOT, "bin", "rustdesk");
const VERSION = "1.4.9";
const ARCH = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : process.arch;

function parseArgs(argv) {
  const args = { version: VERSION, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--version") args.version = argv[++i] ?? args.version;
    else if (argv[i] === "--force") args.force = true;
  }
  return args;
}

function downloadUrl(version) {
  if (process.platform === "darwin") {
    return {
      url: `https://github.com/rustdesk/rustdesk/releases/download/${version}/rustdesk-${version}-${ARCH}.dmg`,
      kind: "dmg",
    };
  }
  if (process.platform === "win32") {
    return {
      url: `https://github.com/rustdesk/rustdesk/releases/download/${version}/rustdesk-${version}-${ARCH}.exe`,
      kind: "exe",
    };
  }
  if (process.platform === "linux") {
    return {
      url: `https://github.com/rustdesk/rustdesk/releases/download/${version}/rustdesk-${version}-${ARCH}.AppImage`,
      kind: "appimage",
    };
  }
  throw new Error(`不支持的平台: ${process.platform}`);
}

async function download(url, target) {
  mkdirSync(dirname(target), { recursive: true });
  const response = await fetch(url, { redirect: "follow" });
  if (response.ok === false || response.body === null) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }
  const chunks = [];
  for await (const chunk of response.body) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  writeFileSync(target, buffer);
}

function executablePath() {
  if (process.platform === "darwin") {
    return join(BIN_DIR, "RustDesk.app", "Contents", "MacOS", "RustDesk");
  }
  if (process.platform === "win32") return join(BIN_DIR, "rustdesk.exe");
  return join(BIN_DIR, "rustdesk.AppImage");
}

async function prepareDarwin(version, force) {
  const appDir = join(BIN_DIR, "RustDesk.app");
  const binary = executablePath();
  if (!force && existsSync(binary)) return binary;
  rmSync(appDir, { recursive: true, force: true });

  const tmp = join(tmpdir(), `rustdesk-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const dmg = join(tmp, "rustdesk.dmg");
  const mount = join(tmp, "mnt");
  mkdirSync(mount, { recursive: true });
  const info = downloadUrl(version);
  await download(info.url, dmg);
  await execFileAsync("hdiutil", ["attach", dmg, "-nobrowse", "-readonly", "-mountpoint", mount]);
  await execFileAsync("cp", ["-R", join(mount, "RustDesk.app"), appDir]);
  await execFileAsync("hdiutil", ["detach", mount, "-quiet"]).catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
  return binary;
}

async function main() {
  const { version, force } = parseArgs(process.argv.slice(2));
  mkdirSync(BIN_DIR, { recursive: true });
  let binary = executablePath();
  if (!force && existsSync(binary)) {
    console.log(`RUSTDESK_READY ${binary}`);
    return;
  }
  if (process.platform === "darwin") binary = await prepareDarwin(version, force);
  else {
    const info = downloadUrl(version);
    await download(info.url, binary);
    if (process.platform === "linux") chmodSync(binary, 0o755);
  }
  console.log(`RUSTDESK_READY ${binary}`);
}

main().catch((error) => {
  console.error(`[setup-rustdesk] 失败: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
