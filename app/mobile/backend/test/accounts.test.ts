// 账号模块纯逻辑单测：配对码签发/单次使用/过期、设备注册、token 认证、吊销。

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { Accounts } from "../src/accounts.ts";
import { openDb } from "../src/db.ts";

function makeAccounts(ttlMs = 600_000) {
  return new Accounts(openDb(":memory:"), ttlMs);
}

describe("accounts", () => {
  test("rotatePairing 生成 6 位码并在 TTL 内有效", () => {
    const a = makeAccounts();
    const p = a.rotatePairing();
    assert.match(p.code, /^\d{6}$/);
    assert.ok(p.expiresAt > Date.now());
    assert.equal(a.currentPairing()?.code, p.code);
  });

  test("pair 注册设备并返回 token，配对码单次使用", () => {
    const a = makeAccounts();
    const { code } = a.rotatePairing();
    const { deviceId, token } = a.pair(code, "iPhone");
    assert.ok(deviceId.length > 0);
    assert.ok(token.length >= 32);
    assert.equal(a.listDevices().length, 1);
    assert.equal(a.listDevices()[0].name, "iPhone");
    assert.throws(() => a.pair(code), /invalid pairing code/);
    assert.equal(a.currentPairing(), null);
  });

  test("pair 使用过期码报错", async () => {
    const a = makeAccounts(1);
    const { code } = a.rotatePairing();
    await sleep(5);
    assert.throws(() => a.pair(code), /expired/);
  });

  test("pair 使用错误码报错", () => {
    const a = makeAccounts();
    assert.throws(() => a.pair("000000"), /invalid pairing code/);
  });

  test("auth 按 token 返回设备，错误 token 返回 null", () => {
    const a = makeAccounts();
    const { code } = a.rotatePairing();
    const { deviceId, token } = a.pair(code);
    const device = a.auth(token);
    assert.equal(device?.id, deviceId);
    assert.equal(a.auth("wrong-token"), null);
  });

  test("revokeDevice 吊销后 auth 失效", () => {
    const a = makeAccounts();
    const { code } = a.rotatePairing();
    const { deviceId, token } = a.pair(code);
    assert.equal(a.revokeDevice(deviceId), true);
    assert.equal(a.auth(token), null);
    assert.equal(a.listDevices().length, 0);
  });
});
