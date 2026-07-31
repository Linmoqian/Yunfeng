// 跨组件复用的会话操作：打开会话并同步文件树的逻辑统一在此实现，
// 避免组件重复维护。

import type { UseFileTreeResult } from "../hooks/useFileTree";
import type { UseSessionsResult } from "../hooks/useSessions";
import type { UseSessionResult } from "../hooks/useSession";
import type { SessionInfo } from "./types";

/**
 * 打开会话并同步文件树根目录。
 * 抛出错误时由调用方决定如何呈现（各变体统一走 session.error）。
 */
export async function openSessionAndSyncTree(
  target: SessionInfo,
  sessions: Pick<UseSessionsResult, "projectRoot">,
  session: Pick<UseSessionResult, "openSession">,
  fileTree: Pick<UseFileTreeResult, "setRoot">,
): Promise<void> {
  const cwd = target.cwd ?? sessions.projectRoot ?? "";
  if (!cwd) return;
  await session.openSession(target, cwd);
  if (sessions.projectRoot !== cwd) fileTree.setRoot(cwd);
}
