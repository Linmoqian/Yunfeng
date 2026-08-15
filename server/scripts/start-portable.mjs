// 以可写 HOME 启动 yunfeng-server。
// 解决系统 HOME 受 TCC/权限保护时 server 无法写 ~/.pi/agent 的问题。
// 调用模型时，需要先把已有 agent 配置复制到目标 HOME：
//   macOS/Linux: cp -R ~/.pi <portable-home>/.pi
//   Windows:     Copy-Item -Recurse $HOME\.pi <portable-home>\.pi
//
// 用法：
//   node scripts/start-portable.mjs [--home <dir>] [--port <port>] [-- <server 额外参数>]

import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = { home: join(tmpdir(), "yunfeng-server-home"), port: "8000" };
  const extra = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      extra.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--home") options.home = argv[++i] ?? options.home;
    else if (arg === "--port") options.port = argv[++i] ?? options.port;
    else extra.push(arg);
  }
  return { options, extra };
}

const { options, extra } = parseArgs(process.argv.slice(2));
const home = resolve(options.home);
const port = Number(options.port);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[server-home] 非法端口: ${options.port}`);
  process.exit(1);
}
mkdirSync(home, { recursive: true });

const tsxBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
if (!existsSync(tsxBin)) {
  console.error(`[server-home] 未找到 tsx，请先在 ${root} 执行 npm install`);
  process.exit(1);
}

console.log(`[server-home] HOME=${home}`);
console.log(`[server-home] agent 配置目录=${join(home, ".pi", "agent")}`);
console.log("[server-home] 调用模型前请先复制 agent 配置到该 HOME（见脚本头注释）");

const child = spawn(
  tsxBin,
  ["src/index.ts", "--port", String(port), ...extra],
  {
    cwd: root,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    stdio: "inherit",
    ...(process.platform === "win32" ? { shell: true } : {}),
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
child.on("exit", (code) => process.exit(code ?? 0));
