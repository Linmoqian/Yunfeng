/* Rust 图片素材 SDK，主窗口与写作窗口复用本机素材库。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
export interface PaperAsset { id: string; name: string; mime: string; width: number; height: number; size: number; caption: string; archived: boolean }
export type AssetAction = { action: "list" } | { action: "import" | "importPdf"; name: string; bytes: number[] } | { action: "read" | "archive" | "restore"; id: string } | { action: "caption"; id: string; caption: string };
export function paperAssetAction<T>(request: AssetAction): Promise<T> {
  if (!isTauri()) return Promise.reject(new Error("图片素材需要 Tauri 原生应用"));
  return invoke<T>("paper_asset_action", { request });
}
export function paperError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "code" in reason && "message" in reason && ["INVALID_ASSET", "ASSET_NOT_FOUND", "ASSET_LIMIT", "STORAGE_ERROR", "STORAGE_VERSION", "FORBIDDEN", "EXPORT_BUSY", "EXPORT_FAILED", "EXPORT_TIMEOUT", "EXPORT_UNAVAILABLE"].includes(String(reason.code))) return String(reason.message);
  return "写作操作失败，请重试";
}
export function assetMarkdown(asset: PaperAsset): string {
  return `\n\n![${(asset.caption || asset.name).replace(/[\[\]\\\r\n]/g, " ")}](paper-asset:${asset.id})\n\n`;
}
