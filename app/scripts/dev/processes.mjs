/* 识别并停止本仓库的旧桌面开发进程；参考 LianAgent，适配 Yunfeng 原生二进制。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { execFile } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WINDOWS = process.platform === 'win32';
const normalize = (value) => WINDOWS ? value.replaceAll('\\', '/').toLowerCase() : value;
const ROOT = normalize(APP_ROOT);

async function listProcesses() {
  const options = { timeout: 5000, maxBuffer: 16 * 1024 * 1024, windowsHide: true };
  if (WINDOWS) {
    const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath,CreationDate | ConvertTo-Json -Compress';
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], options);
    const rows = JSON.parse(stdout);
    return (Array.isArray(rows) ? rows : [rows]).map((row) => ({
      pid: row.ProcessId, parent: row.ParentProcessId, command: row.CommandLine ?? '',
      executable: row.ExecutablePath ?? '', started: String(row.CreationDate),
    }));
  }
  const { stdout } = await execute('ps', ['-axo', 'pid=,ppid=,lstart=,args='], options);
  return stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), started: match[3], command: match[4] }] : [];
  });
}

async function belongsToProject(row) {
  if (WINDOWS) return normalize(row.command).includes(`${ROOT}/`);
  try {
    let cwd;
    if (process.platform === 'linux') cwd = await readlink(`/proc/${row.pid}/cwd`);
    else {
      const { stdout } = await execute('lsof', ['-a', '-p', String(row.pid), '-d', 'cwd', '-Fn'], { timeout: 2000 });
      cwd = stdout.split('\n').find((line) => line.startsWith('n'))?.slice(1);
    }
    return cwd === APP_ROOT || cwd === resolve(APP_ROOT, 'src-tauri');
  } catch { return false; }
}

export function kindOf(row) {
  const command = normalize(row.command);
  const executable = normalize(row.executable ?? '');
  const binary = `${ROOT}/src-tauri/target/`;
  if (command.startsWith(binary)
    && /\/debug\/dev-bundle\/[^/]+\.app\/Contents\/MacOS\/yunfeng-desktop(?:\s|$)/.test(command)) return 'app';
  if ((command.startsWith(binary) || command.startsWith(`"${binary}`) || executable.startsWith(binary))
    && /\/debug\/yunfeng-desktop(?:\.exe)?(?:["\s]|$)/.test(executable || command)) return 'app';
  if (/^(?:\.\/)?target\/(?:[^/\s]+\/)?debug\/yunfeng-desktop(?:\.exe)?(?:\s|$)/.test(command)) return 'app';
  if (/(?:\/tauri(?:\.js)?["']?|cargo-tauri(?:\.exe)?(?:\s+tauri)?)\s+dev(?:\s|$)/.test(command)) return 'tauri';
  if (/\/vite\/bin\/vite\.js(?:["\s]|$)/.test(command)
    && !/--mode(?:=|\s+)(?:preview-|web-shared)/.test(command)) return 'vite';
  return undefined;
}

export async function findOldDesktopProcesses(nativeOnly = false) {
  const rows = await listProcesses();
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  // beforeDevCommand 本身位于新 Tauri 进程下，整条祖先链都必须保留。
  const protectedPids = new Set();
  for (let pid = process.pid; pid && !protectedPids.has(pid); pid = byPid.get(pid)?.parent) protectedPids.add(pid);
  const currentTauri = [...protectedPids].find((pid) => {
    const row = byPid.get(pid);
    return row && kindOf(row) === 'tauri';
  });
  // Tauri 可并行拉起 Cargo；新实例的兄弟进程也属于当前启动链。
  if (currentTauri) {
    const currentTree = new Set([currentTauri]);
    let expanding = true;
    while (expanding) {
      expanding = false;
      for (const row of rows) {
        if (currentTree.has(row.parent) && !currentTree.has(row.pid)) {
          currentTree.add(row.pid);
          protectedPids.add(row.pid);
          expanding = true;
        }
      }
    }
  }
  const selected = new Map();
  for (const row of rows) {
    const kind = kindOf(row);
    if (!kind || (nativeOnly && kind !== 'app') || protectedPids.has(row.pid)) continue;
    const ownBinary = kind === 'app' && normalize(row.executable || row.command).startsWith(`${ROOT}/src-tauri/target/`);
    if (ownBinary || await belongsToProject(row)) selected.set(row.pid, { ...row, kind });
  }
  // 旧 Tauri 的 Cargo、Agent 和前端子进程一并退出，防止监听器再次拉起应用。
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (selected.has(row.parent) && !selected.has(row.pid) && !protectedPids.has(row.pid)) {
        selected.set(row.pid, { ...row, kind: 'child' });
        changed = true;
      }
    }
  }
  return [...selected.values()];
}

async function stillRunning(selected) {
  const current = new Map((await listProcesses()).map((row) => [row.pid, row]));
  return selected.filter((row) => {
    const live = current.get(row.pid);
    // PID 可能被操作系统复用；时间与命令均吻合时才发送信号。
    return live?.started === row.started && live.command === row.command;
  });
}

async function stop(rows, force) {
  for (const row of await stillRunning(rows)) {
    try {
      if (WINDOWS) await execute('taskkill.exe', ['/PID', String(row.pid), ...(force ? ['/F'] : [])], { timeout: 2000, windowsHide: true });
      else process.kill(row.pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH' && !WINDOWS) throw error;
    }
  }
}

export async function stopOldDesktopProcesses(nativeOnly = false) {
  const selected = await findOldDesktopProcesses(nativeOnly);
  if (!selected.length) return;
  console.log(`退出本仓库的旧开发进程：${selected.map((row) => `${row.kind}(${row.pid})`).join('、')}`);
  await stop(selected, false);
  const deadline = Date.now() + 4000;
  let remaining = await stillRunning(selected);
  while (remaining.length && Date.now() < deadline) {
    await delay(200);
    remaining = await stillRunning(remaining);
  }
  if (remaining.length) {
    await stop(remaining, true);
    await delay(300);
    if ((await stillRunning(remaining)).length) throw new Error('旧开发进程仍未退出，请检查进程权限后重试');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--dry-run' || process.argv.length !== 3) throw new Error('请使用 --dry-run 只读核对进程归属');
  console.log((await findOldDesktopProcesses()).map(({ pid, kind }) => ({ pid, kind })));
}
