// 生产打包后端运行时：把 server/gateway/mobile-backend/RustDesk/pi-assets 组装到 release/yunfeng-desktop。
// 用法：
//   pnpm package:backends [-- --out release/yunfeng-desktop] [-- --skip-rustdesk]
// 前提：根 workspace 已 pnpm install；server/gateway 已完成 pnpm build。
// 产物不包含 App 二进制；Tauri App 通过 YUNFENG_SERVICES_DIR=<out> 找到这些服务。
// 依赖产出使用 pnpm deploy --prod：node_modules 为自包含真实文件，可脱离 pnpm store 分发。

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
    throw new Error(`缺少 ${name}: ${path}，请先执行 pnpm install / pnpm build`);
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

// pnpm deploy 产出 prod 依赖；项目源文件（dist/src）由脚本显式拷贝，文件面确定。
function deployService(filterName, srcDir, contentDirs, out) {
  const target = join(out, srcDir.name);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  // --legacy：传统 deploy（拷 package.json 到目标后独立安装）；workspace 成员间无注入依赖，无需 inject 模式。
  execFileSync("pnpm", ["--filter", filterName, "deploy", "--prod", "--legacy", target], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dir of contentDirs) {
    const from = join(srcDir.path, dir);
    if (existsSync(from)) copyDir(from, join(target, dir));
  }
  copyFile(join(srcDir.path, "package.json"), join(target, "package.json"));
}

const { out, skipRustdesk } = parseArgs(process.argv.slice(2));
mkdirSync(out, { recursive: true });

requireDir(join(ROOT, "server", "dist"), "server/dist");
requireDir(join(ROOT, "gateway", "dist"), "gateway/dist");
requireDir(join(ROOT, "pi-assets", "AGENTS.md"), "pi-assets/AGENTS.md");

deployService("yunfeng-server", { name: "server", path: join(ROOT, "server") }, ["dist"], out);
deployService("yunfeng-gateway", { name: "gateway", path: join(ROOT, "gateway") }, ["dist"], out);
deployService(
  "yunfeng-mobile-backend",
  { name: "yunfeng-mobile-backend", path: join(ROOT, "yunfeng-mobile-backend") },
  ["src", "scripts"],
  out,
);

copyDir(join(ROOT, "pi-assets"), join(out, "pi-assets"));

if (skipRustdesk === false) {
  const rustdeskSrc = join(ROOT, "yunfeng-mobile-backend", "bin", "rustdesk");
  if (existsSync(rustdeskSrc) === false) {
    console.log("[package] 准备 RustDesk ...");
    execFileSync("pnpm", ["--filter", "yunfeng-mobile-backend", "run", "setup:rustdesk"], {
      cwd: ROOT,
      stdio: "inherit",
    });
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
  `Yunfeng 桌面端后端运行时\n\n启动 App 前设置：\n${startHint}\n\n或把 YUNFENG_SERVICES_DIR 固定写入环境变量后从托盘选择“启动全部服务”。\npi-assets（AGENTS.md 与内置扩展）已包含在产物中，桌面壳会在隔离 HOME 下自动播种到 pi agent 目录；SciVerse 需要 SCIVERSE_API_TOKEN 环境变量。\n`,
  "utf8",
);

console.log(`[package] 后端运行时已输出到 ${out}`);
console.log(`[package] 启动环境变量：YUNFENG_SERVICES_DIR=${out}`);
