// 远程桌面模块：屏幕捕获循环（JPEG 帧）与输入注入。捕获源/输入器可注入，便于测试与后续替换（CGDisplayStream / WebRTC）。

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DesktopInput } from "./types.ts";

export interface CapturedFrame {
  mime: string;
  data: Buffer;
}

export type CaptureOnce = () => Promise<CapturedFrame>;
export type InputSender = (input: DesktopInput) => Promise<void>;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

/** macOS 默认捕获源：screencapture 输出 JPEG 到临时文件后读回。 */
export function screencaptureCaptureOnce(tmpDir: string): CaptureOnce {
  let counter = 0;
  return async () => {
    const file = join(tmpDir, `frame-${Date.now()}-${counter++}.jpg`);
    await run("screencapture", ["-x", "-t", "jpg", file]);
    const buf = readFileSync(file);
    rmSync(file, { force: true });
    return { mime: "image/jpeg", data: buf };
  };
}

export function encodeInputArgs(input: DesktopInput): string[] {
  switch (input.kind) {
    case "move":
      return ["--move", String(input.x), String(input.y)];
    case "click":
      return ["--click", String(input.x), String(input.y), input.button ?? "left"];
    case "scroll":
      return ["--scroll", String(input.x), String(input.y), String(input.dy)];
    case "key":
      return ["--key", String(input.keyCode), input.down ? "1" : "0"];
  }
}

/** 默认输入器：调用编译好的 native helper（bin/yf-input，CGEvent 注入）。未编译时明确报错。 */
export function swiftInputSender(helperPath: string): InputSender {
  const built = existsSync(helperPath);
  return async (input: DesktopInput) => {
    if (!built) {
      throw new Error("native input helper not built; run npm run build:native");
    }
    await run(helperPath, encodeInputArgs(input));
  };
}

export interface DesktopCallbacks {
  onFrame: (seq: number, frame: CapturedFrame) => void;
  onStop: (reason?: string) => void;
}

/** 按 fps 间隔循环捕获 JPEG 帧。单帧失败忽略并重试下一帧。 */
export class DesktopSession {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private seq = 0;

  private readonly callbacks: DesktopCallbacks;

  constructor(callbacks: DesktopCallbacks) {
    this.callbacks = callbacks;
  }

  get running(): boolean {
    return !this.stopped;
  }

  start(fps: number, capture: CaptureOnce): void {
    this.stop("restart");
    this.stopped = false;
    this.seq = 0;
    const ms = Math.max(100, Math.round(1000 / Math.min(10, Math.max(1, fps))));
    const tick = async () => {
      if (this.stopped) return;
      try {
        const frame = await capture();
        if (this.stopped) return;
        this.callbacks.onFrame(++this.seq, frame);
      } catch {
        // 单帧失败忽略（权限/瞬时错误），下一帧重试
      }
    };
    void tick();
    this.timer = setInterval(tick, ms);
  }

  stop(reason?: string): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callbacks.onStop(reason);
  }
}
