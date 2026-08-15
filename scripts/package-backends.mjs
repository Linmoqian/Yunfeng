// 生产打包后端运行时：把 server/gateway/mobile-backend/RustDesk 组装到 release/yunfeng-desktop。
// 用法：
//   node scripts/package-backends.mjs [--out release/yunfeng-desktop] [--skip-rustdesk]
// 前提：各目录已完成 npm install；server/gateway 已完成 npm run build。
// 产物不包含 App 二进制；Tauri App 通过 YUNFENG_SERVICES_DIR=<out> 找到这些服务。

import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { out: join(ROOT, "release", "yunfeng-desktop"), skipRustdesk: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = resolve(argv[++i] ?? args.out);
    else if (argv[i] === "--skip-rustdesk") args.skipRustdesk = true;
  }
  return args;
}

function requireDir(path, name) {
  if (existsSync(path) === false) {
    throw new Error(`缺少 ${name}: ${path}，请先执行 npm install / npm run build`);
  }
}

function copyDir(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

const { out, skipRustdesk } = parseArgs(process.argv.slice(2));
mkdirSync(out, { recursive: true });

const server = join(ROOT, "server");
const gateway = join(ROOT, "gateway");
const mobileBackend = join(ROOT, "yunfeng-mobile-backend");

requireDir(join(server, "dist"), "server/dist");
requireDir(join(server, "node_modules"), "server/node_modules");
requireDir(join(gateway, "dist"), "gateway/dist");
requireDir(join(gateway, "node_modules"), "gateway/node_modules");
requireDir(join(mobileBackend, "src"), "yunfeng-mobile-backend/src");
requireDir(join(mobileBackend, "node_modules"), "yunfeng-mobile-backend/node_modules");

copyDir(join(server, "dist"), join(out, "server", "dist"));
copyFile(join(server, "package.json"), join(out, "server", "package.json"));
copyDir(join(server, "node_modules"), join(out, "server", "node_modules"));

copyDir(join(gateway, "dist"), join(out, "gateway", "dist"));
copyFile(join(gateway, "package.json"), join(out, "gateway", "package.json"));
copyDir(join(gateway, "node_modules"), join(out, "gateway", "node_modules"));

copyDir(join(mobileBackend, "src"), join(out, "yunfeng-mobile-backend", "src"));
copyFile(join(mobileBackend, "package.json"), join(out, "yunfeng-mobile-backend", "package.json"));
copyDir(join(mobileBackend, "node_modules"), join(out, "yunfeng-mobile-backend", "node_modules"));

if (skipRustdesk === false) {
  const rustdeskSrc = join(mobileBackend, "bin", "rustdesk");
  if (existsSync(rustdeskSrc) === false) {
    console.log("[package] 准备 RustDesk ...");
    execFileSync("npm", ["run", "setup:rustdesk"], { cwd: mobileBackend, stdio: "inherit" });
  }
  if (existsSync(rustdeskSrc)) {
    copyDir(rustdeskSrc, join(out, "rustdesk"));
  } else {
    console.warn("[package] 未找到 RustDesk，已跳过；可通过 --skip-rustdesk 明确跳过");
  }
}

const startHint = process.platform === "darwin"
  ? `YUNFENG_SERVICES_DIR=${out} "${join(ROOT, "app", "src-tauri", "target", "release", "yunfeng-desktop")}"`
  : `set YUNFENG_SERVICES_DIR=${out} && app\\yunfeng-desktop.exe`;
writeFileSync(
  join(out, "START.txt"),
  `Yunfeng 桌面端后端运行时\n\n启动 App 前设置：\n${startHint}\n\n或把 YUNFENG_SERVICES_DIR 固定写入环境变量后从托盘选择“启动全部服务”。\n`,
  "utf8",
);

console.log(`[package] 后端运行时已输出到 ${out}`);
console.log(`[package] 启动环境变量：YUNFENG_SERVICES_DIR=${out}`);
