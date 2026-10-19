/* 复用 LianAgent 开发应用包方案，保留 Cargo 的工作目录、参数及进程生命周期。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stopOldDesktopProcesses } from "./processes.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (!process.argv[2]) throw new Error("Cargo runner 未提供可执行文件");
const binary = resolve(process.argv[2]);
const config = JSON.parse(await readFile(resolve(appRoot, "src-tauri/tauri.conf.json"), "utf8"));
const contents = resolve(dirname(binary), "dev-bundle", `${config.productName} 开发.app`, "Contents");
const executable = resolve(contents, "MacOS", basename(binary));
// Tauri 重载可直接终止 runner；新一轮启动须回收已失去父进程的旧应用。
await stopOldDesktopProcesses(true);
await mkdir(dirname(executable), { recursive: true });
await mkdir(resolve(contents, "Resources"), { recursive: true });
await copyFile(binary, executable, constants.COPYFILE_FICLONE);
await copyFile(resolve(appRoot, "src-tauri/icons/icon.icns"), resolve(contents, "Resources/icon.icns"));
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const plist = await readFile(resolve(appRoot, "src-tauri/Info.plist"), "utf8");
await writeFile(resolve(contents, "Info.plist"), plist.replace("</dict>", `
<key>CFBundleExecutable</key><string>${escape(basename(binary))}</string>
<key>CFBundleName</key><string>${escape(config.productName)} 开发</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>${escape(config.version)}</string>
<key>CFBundleShortVersionString</key><string>${escape(config.version)}</string>
<key>CFBundleIconFile</key><string>icon.icns</string>
</dict>`));
// Cargo 的裸程序签名不包含应用包身份，复制后使用本机临时签名。
const signed = spawnSync("codesign", ["--force", "--sign", "-", "--timestamp=none", dirname(contents)], { stdio: "inherit" });
if (signed.error || signed.status !== 0) throw new Error("macOS 开发应用包签名失败");
console.log("[成功] macOS 开发应用包已准备，正在启动 Yunfeng");
const child = spawn(executable, process.argv.slice(3), { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.once("error", () => { console.error("[错误] 无法启动开发应用包"); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1); });
