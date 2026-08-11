// 账号模块：配对码签发/校验、设备注册、token 认证。原始 token 只返回一次，库中仅存 sha256。

import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Device, PairingInfo } from "./types.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class Accounts {
  private readonly db: DatabaseSync;
  private readonly pairTtlMs: number;

  constructor(db: DatabaseSync, pairTtlMs: number) {
    this.db = db;
    this.pairTtlMs = pairTtlMs;
  }

  rotatePairing(): PairingInfo {
    this.db.prepare("DELETE FROM pairings").run();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = Date.now() + this.pairTtlMs;
    this.db
      .prepare("INSERT INTO pairings (code, expires_at, used_at) VALUES (?, ?, NULL)")
      .run(code, expiresAt);
    return { code, expiresAt };
  }

  currentPairing(): PairingInfo | null {
    const row = this.db
      .prepare(
        "SELECT code, expires_at FROM pairings WHERE used_at IS NULL AND expires_at > ?",
      )
      .get(Date.now()) as { code: string; expires_at: number } | undefined;
    return row ? { code: row.code, expiresAt: row.expires_at } : null;
  }

  pair(code: string, name?: string): { deviceId: string; token: string } {
    const now = Date.now();
    const row = this.db
      .prepare("SELECT expires_at FROM pairings WHERE code = ? AND used_at IS NULL")
      .get(code) as { expires_at: number } | undefined;
    if (!row) throw new Error("invalid pairing code");
    if (row.expires_at <= now) throw new Error("pairing code expired");
    this.db.prepare("UPDATE pairings SET used_at = ? WHERE code = ?").run(now, code);

    const deviceId = randomUUID();
    const token = randomBytes(32).toString("hex");
    const nameSafe = (name ?? "").trim().slice(0, 40) || `设备-${deviceId.slice(0, 4)}`;
    this.db
      .prepare(
        "INSERT INTO devices (id, name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(deviceId, nameSafe, sha256(token), now, now);
    return { deviceId, token };
  }

  auth(token: string): Device | null {
    const row = this.db
      .prepare("SELECT id, name, created_at, last_seen_at FROM devices WHERE token_hash = ?")
      .get(sha256(token)) as
      | { id: string; name: string; created_at: number; last_seen_at: number }
      | undefined;
    return row
      ? { id: row.id, name: row.name, createdAt: row.created_at, lastSeenAt: row.last_seen_at }
      : null;
  }

  touch(deviceId: string): void {
    this.db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(Date.now(), deviceId);
  }

  listDevices(): Device[] {
    const rows = this.db
      .prepare("SELECT id, name, created_at, last_seen_at FROM devices ORDER BY created_at")
      .all() as { id: string; name: string; created_at: number; last_seen_at: number }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
    }));
  }

  revokeDevice(id: string): boolean {
    const result = this.db.prepare("DELETE FROM devices WHERE id = ?").run(id);
    return result.changes > 0;
  }
}
