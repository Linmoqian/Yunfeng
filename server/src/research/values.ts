/* 科研边界共用的对象与文本校验，避免组件和计划解析互相依赖。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("需要结构化对象");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) throw new Error("文本字段无效或过长");
  return value;
}
