/* Rust 本地协作 IPC 契约；不提供浏览器内存实现。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { invoke } from "@tauri-apps/api/core";

export interface CollaborationLink { title: string; url: string }
export interface LocalTeam { id: string; name: string; owner: string; members: string[] }
export interface CollaborationSnapshot {
  installationId: string;
  mode: "empty" | "local";
  team: LocalTeam | null;
  savedTeams: LocalTeam[];
  messages: { id: string; name: string; text: string; createdAt: number }[];
  board: string;
  links: CollaborationLink[];
  networkAvailable: boolean;
}
export type CollaborationAction =
  | { action: "snapshot" | "leave" }
  | { action: "create"; name: string; owner: string }
  | { action: "message"; id: string; text: string }
  | { action: "board"; announcement: string; links: CollaborationLink[] }
  | { action: "activate"; id: string };

/** 调用主窗口的协作能力；失败返回 Rust 稳定错误，不保存前端副本。 */
export function collaborationAction(input: CollaborationAction): Promise<CollaborationSnapshot> {
  return invoke<CollaborationSnapshot>("collaboration_action", { input });
}
export function collaborationError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && error.code.startsWith("COLLAB_") && "message" in error && typeof error.message === "string") return error.message;
  return "协作服务调用失败，请在桌面应用中重试";
}
