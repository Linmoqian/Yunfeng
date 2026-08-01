// 会话路径标准化工具。

export function sessionPathKey(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

export function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}
