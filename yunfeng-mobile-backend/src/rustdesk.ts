// RustDesk sidecar 管理：启动/停止内嵌的 RustDesk 服务进程，并读取连接信息。
// 源码固定版本见 vendor/rustdesk（AGPL-3.0）；二进制由 scripts/setup-rustdesk.mjs 下载到 bin/（不提交）。
// 后端只读取 ID 与“是否已配置密码”，不解析/记录密码明文。

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RustDeskMode = "service" | "gui";

export interface RustDeskInfo {
  available: boolean;
  running: boolean;
  id: string | null;
  passwordConfigured: boolean;
  mode: RustDeskMode | null;
  binaryPath: string | null;
  configPath: string | null;
}

export interface RustDeskSidecarOptions {
  home?: string;
  binaryPath?: string;
  logger?: { info(message: string): void; warn(message: string): void };
}

function defaultBinaryPath(): string {
  const root = resolve(fileURLToPath(import.meta.url), "..", "..");
  if (process.env.RUSTDESK_BIN) return resolve(process.env.RUSTDESK_BIN);
  if (process.platform === "darwin") {
    return join(root, "bin", "rustdesk", "RustDesk.app", "Contents", "MacOS", "RustDesk");
  }
  if (process.platform === "win32") return join(root, "bin", "rustdesk", "rustdesk.exe");
  return join(root, "bin", "rustdesk", "rustdesk.AppImage");
}

function installedBinaryCandidates(): string[] {
  const embedded = defaultBinaryPath();
  if (process.platform === "darwin") {
    return [embedded, "/Applications/RustDesk.app/Contents/MacOS/RustDesk"];
  }
  if (process.platform === "win32") {
    return [embedded, join(process.env["PROGRAMFILES"] ?? "", "RustDesk", "rustdesk.exe")];
  }
  return [embedded, "/usr/bin/rustdesk"];
}

function configPathFor(home: string): string {
  if (process.env.RUSTDESK_CONFIG) return resolve(process.env.RUSTDESK_CONFIG);
  if (process.platform === "darwin") {
    return join(home, "Library", "Preferences", "com.carriez.RustDesk", "RustDesk.toml");
  }
  if (process.platform === "win32") {
    return join(process.env["APPDATA"] ?? home, "RustDesk", "config", "RustDesk.toml");
  }
  return join(home, ".config", "rustdesk", "RustDesk.toml");
}

function passwordConfiguredAt(configPath: string): boolean {
  try {
    const text = readFileSync(configPath, "utf8");
    const password = text.match(/^password\s*=\s*'([^']*)'/m)?.[1] ?? "";
    return password.length > 0;
  } catch {
    return false;
  }
}

function setPlainPassword(configPath: string, password: string): void {
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch {
    text = "";
  }
  const withPassword = /^password\s*=\s*'.*'?$/m.test(text)
    ? text.replace(/^password\s*=\s*'.*'?$/m, `password = '${password}'`)
    : `${text}\npassword = '${password}'\n`;
  const next = /^salt\s*=\s*'.*'?$/m.test(withPassword)
    ? withPassword.replace(/^salt\s*=\s*'.*'?$/m, "salt = ''")
    : `${withPassword}\nsalt = ''\n`;
  writeFileSync(configPath, next, { mode: 0o600 });
}

export class RustDeskSidecar {
  private child: ChildProcess | null = null;
  private mode: RustDeskMode | null = null;
  private temporaryPassword: string | null = null;
  private readonly home: string;
  private readonly binaryOverride?: string;
  private readonly logger?: RustDeskSidecarOptions["logger"];

  constructor(options: RustDeskSidecarOptions = {}) {
    this.home = options.home ?? homedir();
    this.binaryOverride = options.binaryPath;
    this.logger = options.logger;
  }

  resolveBinary(): string | null {
    if (this.binaryOverride !== undefined) {
      return existsSync(this.binaryOverride) ? this.binaryOverride : null;
    }
    for (const candidate of installedBinaryCandidates()) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  get configPath(): string {
    return configPathFor(this.home);
  }

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  async start(mode: RustDeskMode = "service"): Promise<string | null> {
    if (this.isRunning()) return this.temporaryPassword;
    const binary = this.resolveBinary();
    if (binary === null) {
      throw new Error("未找到 RustDesk 可执行文件，请先运行 npm run setup:rustdesk");
    }

    // 首次启动且尚未配置密码时，自动写入一个一次性明文密码供移动端首次连接。
    // RustDesk 支持明文密码存储（本地文件权限 600）；之后可在 RustDesk 中改为正式密码。
    if (passwordConfiguredAt(this.configPath) === false) {
      await this.getId();
      if (existsSync(this.configPath)) {
        this.temporaryPassword = randomBytes(5).toString("hex").slice(0, 10);
        setPlainPassword(this.configPath, this.temporaryPassword);
        this.logger?.info("rustdesk temporary password prepared");
      }
    } else {
      this.temporaryPassword = null;
    }

    const args = mode === "service" ? ["--server"] : [];
    const child = spawn(binary, args, {
      env: { ...process.env, HOME: this.home },
      stdio: "ignore",
    });
    child.once("error", () => {
      if (this.child === child) this.child = null;
    });
    child.once("exit", () => {
      if (this.child === child) this.child = null;
    });
    this.child = child;
    this.mode = mode;
    this.logger?.info(`rustdesk started mode=${mode} pid=${child.pid ?? "unknown"}`);
    await this.waitForId(10_000);
    return this.temporaryPassword;
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.mode = null;
    this.temporaryPassword = null;
    if (child === null || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.logger?.info("rustdesk stopped");
  }

  async getId(): Promise<string | null> {
    const binary = this.resolveBinary();
    if (binary === null) return null;
    try {
      const { stdout } = await execFileAsync(binary, ["--get-id"], {
        env: { ...process.env, HOME: this.home },
        timeout: 8_000,
      });
      const id = stdout.trim().split(/\r?\n/).map((line) => line.trim()).find((line) => /^\d+$/.test(line));
      return id ?? null;
    } catch {
      return null;
    }
  }

  async waitForId(timeoutMs: number): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const id = await this.getId();
      if (id !== null) return id;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return this.getId();
  }

  async info(): Promise<RustDeskInfo> {
    const binaryPath = this.resolveBinary();
    const available = binaryPath !== null;
    const running = this.isRunning();
    const id = available ? await this.getId() : null;
    return {
      available,
      running,
      id,
      passwordConfigured: passwordConfiguredAt(this.configPath),
      mode: running ? this.mode : null,
      binaryPath,
      configPath: this.configPath,
    };
  }
}
