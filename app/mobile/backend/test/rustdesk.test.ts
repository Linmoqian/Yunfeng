// RustDesk sidecar 单元测试：用假二进制验证启动/停止、ID 读取与密码配置判断。

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { RustDeskSidecar } from "../src/rustdesk.ts";

const root = mkdtempSync(join(tmpdir(), "rustdesk-test-"));

function makeFakeBinary(): string {
  const dir = join(root, "bin");
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "rustdesk");
  writeFileSync(
    script,
    `#!/usr/bin/env node
if (process.argv[2] === "--get-id") {
  console.log("123456789");
  process.exit(0);
}
setInterval(() => {}, 1000);
`,
  );
  chmodSync(script, 0o755);
  return script;
}

function configDir(home: string): string {
  return join(home, "Library", "Preferences", "com.carriez.RustDesk");
}

function writeConfig(home: string, password: string, salt: string): void {
  const dir = configDir(home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "RustDesk.toml"), `enc_id = 'x'\npassword = '${password}'\nsalt = '${salt}'\n`);
}

after(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("RustDeskSidecar", () => {
  test("info 识别可执行文件、ID 与密码配置状态", async () => {
    const home = join(root, "home-without-password");
    writeConfig(home, "", "");
    const sidecar = new RustDeskSidecar({ home, binaryPath: makeFakeBinary() });
    const info = await sidecar.info();
    assert.equal(info.available, true);
    assert.equal(info.running, false);
    assert.equal(info.id, "123456789");
    assert.equal(info.passwordConfigured, false);
  });

  test("service 模式启动后可读取运行状态并停止", async () => {
    const home = join(root, "home-running");
    writeConfig(home, "encrypted-password", "salt");
    const sidecar = new RustDeskSidecar({ home, binaryPath: makeFakeBinary() });
    await sidecar.start("service");
    try {
      assert.equal(sidecar.isRunning(), true);
      const info = await sidecar.info();
      assert.equal(info.running, true);
      assert.equal(info.mode, "service");
      assert.equal(info.id, "123456789");
      assert.equal(info.passwordConfigured, true);
    } finally {
      await sidecar.stop();
    }
    assert.equal(sidecar.isRunning(), false);
  });

  test("缺少可执行文件时 start 抛出明确错误", async () => {
    const home = join(root, "home-missing");
    const sidecar = new RustDeskSidecar({ home, binaryPath: join(root, "not-exists") });
    await assert.rejects(() => sidecar.start(), /未找到 RustDesk/);
  });
});
