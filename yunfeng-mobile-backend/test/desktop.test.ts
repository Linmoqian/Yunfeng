// 远程桌面模块纯逻辑单测：输入参数编码、捕获循环、失败重试、helper 缺失报错。

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { DesktopSession, encodeInputArgs, swiftInputSender } from "../src/desktop.ts";

describe("desktop", () => {
  test("encodeInputArgs 覆盖四类输入", () => {
    assert.deepEqual(encodeInputArgs({ kind: "move", x: 1, y: 2 }), ["--move", "1", "2"]);
    assert.deepEqual(encodeInputArgs({ kind: "click", x: 3, y: 4, button: "right" }), [
      "--click",
      "3",
      "4",
      "right",
    ]);
    assert.deepEqual(encodeInputArgs({ kind: "scroll", x: 5, y: 6, dy: -3 }), [
      "--scroll",
      "5",
      "6",
      "-3",
    ]);
    assert.deepEqual(encodeInputArgs({ kind: "key", keyCode: 49, down: true }), [
      "--key",
      "49",
      "1",
    ]);
  });

  test("swiftInputSender 未编译 helper 时明确报错", async () => {
    const sender = swiftInputSender("/nonexistent/yf-input");
    await assert.rejects(() => sender({ kind: "move", x: 0, y: 0 }), /not built/);
  });

  test("DesktopSession 按 fps 输出连续帧", async () => {
    const frames: Buffer[] = [];
    const stopped: string[] = [];
    const session = new DesktopSession({
      onFrame: (_seq, jpeg) => frames.push(jpeg),
      onStop: (reason) => stopped.push(reason ?? "none"),
    });
    session.start(10, async () => Buffer.from("JPEG1"));
    await sleep(280);
    session.stop("test");
    assert.ok(frames.length >= 2, `frames=${frames.length}`);
    assert.ok(frames.every((f) => f.toString() === "JPEG1"));
    assert.equal(session.running, false);
    assert.deepEqual(stopped, ["test"]);
  });

  test("单帧失败忽略，后续帧继续", async () => {
    let attempts = 0;
    const frames: Buffer[] = [];
    const session = new DesktopSession({
      onFrame: (_seq, jpeg) => frames.push(jpeg),
      onStop: () => {},
    });
    session.start(10, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("boom");
      return Buffer.from("OK");
    });
    await sleep(280);
    session.stop();
    assert.ok(frames.length >= 1, `frames=${frames.length}`);
  });
});
