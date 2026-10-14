/* 在独立子进程验证 Lin 与 Pi 配置、资源和会话的隔离。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function withHome(run: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), "yunfeng-lin-"));
  try { run(home); } finally { rmSync(home, { recursive: true, force: true }); }
}

function runIsolated(home: string, script: string, overrides: Record<string, string> = {}): string {
  const env = { ...process.env };
  for (const key of ["YUNFENG_AGENT_DIR", "YUNFENG_RUNTIME_HOME", "YUNFENG_DATA_DIR", "LIN_CODING_AGENT_DIR", "LIN_CODING_AGENT_SESSION_DIR", "PI_PACKAGE_DIR"]) delete env[key];
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: new URL("../", import.meta.url),
    env: { ...env, HOME: home, USERPROFILE: home, ...overrides },
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("全局和项目资源使用 .lin，忽略 Pi 的设置、扩展与会话环境变量", () => {
  withHome((home) => {
    const cwd = join(home, "project");
    for (const namespace of [".pi", ".lin"]) {
      const globalDir = join(home, namespace, "agent");
      const projectDir = join(cwd, namespace);
      mkdirSync(join(globalDir, "extensions"), { recursive: true });
      mkdirSync(join(projectDir, "prompts"), { recursive: true });
      writeFileSync(join(globalDir, "settings.json"), JSON.stringify({ defaultProvider: namespace }));
      writeFileSync(join(projectDir, "settings.json"), JSON.stringify({ defaultModel: namespace }));
      writeFileSync(join(globalDir, "extensions", "marker.js"), `export default function () { process.env.${namespace === ".pi" ? "PI_MARKER" : "LIN_MARKER"} = "loaded"; }`);
      writeFileSync(join(projectDir, "prompts", `${namespace.slice(1)}.md`), `---\ndescription: ${namespace}\n---\n${namespace} prompt`);
      writeFileSync(join(projectDir, "SYSTEM.md"), `${namespace} system prompt`);
    }
    const piSettings = readFileSync(join(home, ".pi", "agent", "settings.json"), "utf8");
    const output = runIsolated(home, `
      import assert from 'node:assert/strict';
      import { join } from 'node:path';
      import { CONFIG_DIR_NAME, getAgentDir, createAgentSessionServices, createAgentSessionFromServices, SessionManager, initTheme } from './src/agent/sdk.ts';
      import { getYunfengDataDir } from './src/task/task-store.ts';
      const cwd = ${JSON.stringify(cwd)};
      assert.equal(CONFIG_DIR_NAME, '.lin');
      assert.equal(getAgentDir(), join(process.env.HOME, '.lin', 'agent'));
      assert.equal(getYunfengDataDir(), join(process.env.HOME, '.lin'));
      initTheme();
      const services = await createAgentSessionServices({ cwd, agentDir: getAgentDir(), resourceLoaderReloadOptions: { resolveProjectTrust: async () => true } });
      assert.equal(services.settingsManager.getDefaultProvider(), '.lin');
      assert.equal(services.settingsManager.getDefaultModel(), '.lin');
      assert.equal(process.env.LIN_MARKER, 'loaded');
      assert.equal(process.env.PI_MARKER, undefined);
      assert.deepEqual(services.resourceLoader.getPrompts().prompts.map(p => p.name), ['lin']);
      assert.equal(services.resourceLoader.getSystemPrompt(), '.lin system prompt');
      const manager = SessionManager.create(cwd);
      manager.appendMessage({ role: 'user', content: 'Lin isolation', timestamp: Date.now() });
      assert.ok(manager.getSessionFile().startsWith(join(getAgentDir(), 'sessions')));
      const sessions = await SessionManager.listAll();
      assert.equal(sessions.length, 1);
      const { session } = await createAgentSessionFromServices({ services, sessionManager: manager });
      assert.ok(session.getAllTools().some(t => t.name === 'read'));
      session.dispose();
      console.log('lin-isolation-ok');
    `, {
      PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
      PI_CODING_AGENT_SESSION_DIR: join(home, ".pi", "sessions"),
    });
    assert.match(output, /lin-isolation-ok/);
    assert.equal(readFileSync(join(home, ".pi", "agent", "settings.json"), "utf8"), piSettings);
  });
});

test("独立运行时 HOME 与显式 Agent 目录按 Yunfeng 优先级解析", () => {
  withHome((home) => {
    const runtime = join(home, "runtime");
    const selected = join(home, "selected");
    const script = `import { getAgentDir } from './src/agent/sdk.ts'; console.log(getAgentDir());`;
    assert.equal(runIsolated(home, script, { YUNFENG_RUNTIME_HOME: runtime }).trim(), join(runtime, ".lin", "agent"));
    assert.equal(runIsolated(home, script, { LIN_CODING_AGENT_DIR: selected }).trim(), selected);
    assert.equal(runIsolated(home, script, { YUNFENG_AGENT_DIR: "~\\custom" }).trim(), join(home, "custom"));
    assert.equal(runIsolated(home, script, { YUNFENG_RUNTIME_HOME: runtime, LIN_CODING_AGENT_DIR: join(home, "lin"), YUNFENG_AGENT_DIR: selected }).trim(), selected);
  });
});

test("SDK 提前按 Pi 命名空间加载时明确拒绝启动", () => {
  withHome((home) => {
    const output = runIsolated(home, `
      import assert from 'node:assert/strict';
      await import('@earendil-works/pi-coding-agent');
      await assert.rejects(import('./src/agent/sdk.ts'), /拒绝使用非 .lin/);
      console.log('early-import-rejected');
    `);
    assert.match(output, /early-import-rejected/);
  });
});
