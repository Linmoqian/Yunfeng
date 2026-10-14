/* Tauri 统一入口：macOS 开发通过 Cargo runner 获得可识别的应用包身份。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stopOldDesktopProcesses } from "./processes.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const cli = resolve(dirname(require.resolve("@tauri-apps/cli/package.json")), "tauri.js");
const input = process.argv.slice(2);
let args = input.length ? input : ["dev"];
if (process.platform === "darwin" && args[0] === "dev" && !args.includes("--help") && !args.includes("-h")) {
  const runner = JSON.stringify([process.execPath, resolve(appRoot, "scripts/dev/macos-app.mjs")]);
  const separator = args.indexOf("--");
  const options = separator < 0 ? args.slice(1) : args.slice(1, separator);
  const cargoArgs = separator < 0 ? [] : args.slice(separator + 1);
  args = ["dev", ...options, "--", "--config", `target.aarch64-apple-darwin.runner=${runner}`,
    "--config", `target.x86_64-apple-darwin.runner=${runner}`, ...cargoArgs];
}
if (args[0] === "dev" && !args.includes("--help") && !args.includes("-h")) await stopOldDesktopProcesses();
const child = spawn(process.execPath, [cli, ...args], { cwd: appRoot, stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.once("error", () => { console.error("[错误] 无法启动 Tauri CLI"); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1); });
