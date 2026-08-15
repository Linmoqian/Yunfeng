// 验证用后端入口：注入演示捕获源（生成 PNG 帧，无需屏幕录制权限），其余装配与真实入口一致。
// 用法：node scripts/dev-backend.mjs --host 0.0.0.0 --port 8787

import { deflateSync } from "node:zlib";
import { createBackend } from "../src/index.ts";
import { loadConfig } from "../src/config.ts";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function solidPng(width, height, [r, g, b]) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const config = loadConfig(process.argv.slice(2));
const frame = solidPng(320, 200, [32, 58, 94]);
const backend = createBackend(config, {
  captureOnce: async () => ({ mime: "image/png", data: frame }),
});
backend.server.listen(config.port, config.host, () => {
  const pairing = backend.accounts.rotatePairing();
  console.log(
    `YF_MOBILE_READY ${config.host} ${config.port} ${pairing.code} ${new Date(pairing.expiresAt).toISOString()}`,
  );
});
const shutdown = () => {
  void backend.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
