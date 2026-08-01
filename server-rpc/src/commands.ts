// 命令分发：把 pi-web 风格的命令映射到官方 RpcCommand。
// 官方 RpcClient 的私有 send 通过类型断言访问，响应统一判错。

import type { RpcCommand, RpcResponse } from "@earendil-works/pi-coding-agent";
import type { RpcSessionHandle } from "./rpc-session.js";

export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

function isSuccess(response: RpcResponse): response is Extract<RpcResponse, { success: true }> {
  return response.success === true;
}

/**
 * 发送命令到会话。
 * 返回 { success, data | error }，兼容 pi-web 的 { success: true, data } 契约。
 */
export async function executeCommand(
  handle: RpcSessionHandle,
  command: Record<string, unknown>,
): Promise<CommandResult> {
  const type = command.type as string;
  const rpcCommand = mapCommand(type, command);
  try {
    const response = await handle.send(rpcCommand);
    if (isSuccess(response)) {
      return { success: true, data: (response as { data?: unknown }).data };
    }
    const errorResponse = response as Extract<RpcResponse, { success: false }>;
    return { success: false, error: errorResponse.error };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * pi-web 命令 → 官方 RpcCommand 映射。
 * 不支持的命令抛错，由调用方转成错误响应。
 */
function mapCommand(type: string, command: Record<string, unknown>): RpcCommand {
  switch (type) {
    case "prompt":
      return {
        type: "prompt",
        message: command.message as string,
        ...(Array.isArray(command.images) && (command.images as unknown[]).length
          ? { images: command.images as never[] }
          : {}),
        ...(command.streamingBehavior ? { streamingBehavior: command.streamingBehavior as "steer" | "followUp" } : {}),
      };
    case "steer":
      return {
        type: "steer",
        message: command.message as string,
        ...(Array.isArray(command.images) && (command.images as unknown[]).length
          ? { images: command.images as never[] }
          : {}),
      };
    case "follow_up":
      return {
        type: "follow_up",
        message: command.message as string,
        ...(Array.isArray(command.images) && (command.images as unknown[]).length
          ? { images: command.images as never[] }
          : {}),
      };
    case "abort":
      return { type: "abort" };
    case "get_state":
      return { type: "get_state" };
    case "set_model":
      return {
        type: "set_model",
        provider: command.provider as string,
        modelId: command.modelId as string,
      };
    case "cycle_model":
      return { type: "cycle_model" };
    case "get_available_models":
      return { type: "get_available_models" };
    case "set_thinking_level":
      return { type: "set_thinking_level", level: command.level as never };
    case "cycle_thinking_level":
      return { type: "cycle_thinking_level" };
    case "get_available_thinking_levels":
      return { type: "get_available_thinking_levels" };
    case "set_steering_mode":
      return { type: "set_steering_mode", mode: command.mode as "all" | "one-at-a-time" };
    case "set_follow_up_mode":
      return { type: "set_follow_up_mode", mode: command.mode as "all" | "one-at-a-time" };
    case "compact":
      return {
        type: "compact",
        ...(command.customInstructions ? { customInstructions: command.customInstructions as string } : {}),
      };
    case "set_auto_compaction":
      return { type: "set_auto_compaction", enabled: command.enabled as boolean };
    case "set_auto_retry":
      return { type: "set_auto_retry", enabled: command.enabled as boolean };
    case "abort_retry":
      return { type: "abort_retry" };
    case "bash":
      return {
        type: "bash",
        command: command.command as string,
        ...(command.excludeFromContext !== undefined ? { excludeFromContext: command.excludeFromContext as boolean } : {}),
      };
    case "abort_bash":
      return { type: "abort_bash" };
    case "get_session_stats":
      return { type: "get_session_stats" };
    case "export_html":
      return {
        type: "export_html",
        ...(command.outputPath ? { outputPath: command.outputPath as string } : {}),
      };
    case "switch_session":
      return { type: "switch_session", sessionPath: command.sessionPath as string };
    case "fork":
      return { type: "fork", entryId: command.entryId as string };
    case "clone":
      return { type: "clone" };
    case "get_fork_messages":
      return { type: "get_fork_messages" };
    case "get_entries":
      return {
        type: "get_entries",
        ...(command.since ? { since: command.since as string } : {}),
      };
    case "get_tree":
      return { type: "get_tree" };
    case "get_last_assistant_text":
      return { type: "get_last_assistant_text" };
    case "set_session_name":
      return { type: "set_session_name", name: command.name as string };
    case "get_messages":
      return { type: "get_messages" };
    case "get_commands":
      return { type: "get_commands" };
    case "new_session":
      return {
        type: "new_session",
        ...(command.parentSession ? { parentSession: command.parentSession as string } : {}),
      };
    case "ensure_session":
      // 仅用于创建运行时；官方协议无此命令，等价于 get_state 探活。
      return { type: "get_state" };
    default:
      throw new Error(`Unsupported command: ${type}`);
  }
}
